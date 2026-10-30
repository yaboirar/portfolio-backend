"""Cookie-only admin authentication for the supplied sqlite3/HTTPServer project.

See README.md for integration. Uses the existing database.get_db() connection.
"""
import datetime
import hashlib
import json
import os
import re
import secrets
import time
import ipaddress
from http.cookies import SimpleCookie, CookieError
from urllib.parse import urlsplit

import database

def safe_log_activity(*args, **kwargs):
    log_fn = getattr(database, 'log_activity', None)
    if callable(log_fn):
        try:
            log_fn(*args, **kwargs)
        except Exception:
            pass


ITERATIONS = 600_000
ADMIN_PREFIX = '/ventilover67adminlogin'
SESSION_SECONDS = 8 * 60 * 60
IDLE_SECONDS = 30 * 60
MAX_BODY = 4096
_DUMMY_SALT = secrets.token_hex(16)
_DUMMY_HASH = hashlib.pbkdf2_hmac('sha256', b'dummy', _DUMMY_SALT.encode(), ITERATIONS).hex()


def init_auth():
    """Run AFTER database.init_db(), before accepting requests; back up DB first."""
    with database.get_db() as conn:
        conn.execute('''CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL COLLATE NOCASE,
            password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL
        )''')
        columns = {row[1] for row in conn.execute('PRAGMA table_info(admins)')}
        if 'password_iterations' not in columns:
            conn.execute('ALTER TABLE admins ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 200000')
        conn.execute('''CREATE TABLE IF NOT EXISTS auth_sessions (
            token_hash TEXT PRIMARY KEY, admin_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
            last_seen INTEGER NOT NULL,
            FOREIGN KEY(admin_id) REFERENCES admins(id) ON DELETE CASCADE
        )''')
        conn.execute('CREATE INDEX IF NOT EXISTS auth_session_admin ON auth_sessions(admin_id)')
        conn.execute('''CREATE TABLE IF NOT EXISTS auth_limits (
            bucket TEXT PRIMARY KEY, reset_at INTEGER NOT NULL, attempts INTEGER NOT NULL
        )''')
        # Legacy raw tokens are revoked. They are never read by this module.
        if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sessions'").fetchone():
            conn.execute('DELETE FROM sessions')
    validate_origin()


def validate_origin():
    origin = os.environ.get('PUBLIC_ORIGIN', '').rstrip('/')
    parsed = urlsplit(origin)
    if (not parsed.hostname or parsed.username or parsed.password or parsed.query
            or parsed.fragment or parsed.path or parsed.scheme not in ('http', 'https')):
        raise RuntimeError('Set PUBLIC_ORIGIN to the exact site origin, e.g. https://example.com')
    is_ip = bool(re.fullmatch(r'\d+\.\d+\.\d+\.\d+', parsed.hostname))
    is_local = parsed.hostname in ('localhost', '127.0.0.1', '::1')
    allow_insecure = os.environ.get('ALLOW_INSECURE_HTTP') == '1'
    if parsed.scheme == 'http' and not (is_local or allow_insecure):
        raise RuntimeError('HTTPS is required outside localhost')
    return origin


def hash_password(password, salt=None, iterations=ITERATIONS):
    salt = salt or secrets.token_hex(16)
    return hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), iterations).hex(), salt


def validate_credentials(username, password, new_password=False):
    if not isinstance(username, str) or not isinstance(password, str):
        raise ValueError('Username and password must be text')
    username = username.strip()
    if not 3 <= len(username) <= 32:
        raise ValueError('Username must be 3–32 characters')
    if new_password and not re.fullmatch(r'[A-Za-z0-9_]+', username):
        raise ValueError('Username must be 3–32 letters, numbers or underscores')
    minimum = 15 if new_password else 1
    if not minimum <= len(password) <= 128 or len(password.encode()) > 512:
        raise ValueError('Use a password between 15 and 128 characters' if new_password else 'Invalid credentials')
    return username, password


def set_admin_password(username, password):
    """Local CLI only. Updating a password revokes all sessions for that admin."""
    username, password = validate_credentials(username, password, True)
    digest, salt = hash_password(password)
    with database.get_db() as conn:
        conn.execute('''INSERT INTO admins (username, password_hash, salt, created_at, password_iterations)
            VALUES (?, ?, ?, ?, ?) ON CONFLICT(username) DO UPDATE SET
            password_hash=excluded.password_hash, salt=excluded.salt,
            password_iterations=excluded.password_iterations''',
            (username, digest, salt, datetime.datetime.now(datetime.timezone.utc).isoformat(), ITERATIONS))
        admin = conn.execute('SELECT id FROM admins WHERE username=? COLLATE NOCASE', (username,)).fetchone()
        conn.execute('DELETE FROM auth_sessions WHERE admin_id=?', (admin['id'],))


def authenticate(username, password):
    with database.get_db() as conn:
        admin = conn.execute('SELECT * FROM admins WHERE username=? COLLATE NOCASE', (username,)).fetchone()
    rounds = admin['password_iterations'] if admin else ITERATIONS
    calculated, _ = hash_password(password, admin['salt'] if admin else _DUMMY_SALT, rounds)
    valid = secrets.compare_digest(calculated, admin['password_hash'] if admin else _DUMMY_HASH)
    # Equalize legacy lookup timing to approximately the new cost.
    if rounds < ITERATIONS:
        hash_password(password, _DUMMY_SALT, ITERATIONS - rounds)
    if not admin or not valid:
        return None
    if rounds < ITERATIONS:
        digest, salt = hash_password(password)
        with database.get_db() as conn:
            changed = conn.execute('UPDATE admins SET password_hash=?, salt=?, password_iterations=? WHERE id=? AND password_hash=?',
                         (digest, salt, ITERATIONS, admin['id'], admin['password_hash']))
            if not changed.rowcount:
                return None
        admin = dict(admin)
        admin.update(password_hash=digest, salt=salt, password_iterations=ITERATIONS)
    return dict(admin)


def digest_token(token):
    return hashlib.sha256(token.encode('ascii')).hexdigest()


def csrf_for(token):
    return hashlib.sha256(('csrf:' + token).encode('ascii')).hexdigest()


def create_session(admin_id, expected_password_hash=None):
    token = secrets.token_hex(32)
    now = int(time.time())
    with database.get_db() as conn:
        conn.execute('BEGIN IMMEDIATE')
        current = conn.execute('SELECT password_hash FROM admins WHERE id=?', (admin_id,)).fetchone()
        if not current or (expected_password_hash is not None and not secrets.compare_digest(current['password_hash'], expected_password_hash)):
            return None
        conn.execute('DELETE FROM auth_sessions WHERE expires_at<=? OR last_seen<=?', (now, now-IDLE_SECONDS))
        conn.execute('INSERT INTO auth_sessions VALUES (?, ?, ?, ?, ?)',
                     (digest_token(token), admin_id, now, now+SESSION_SECONDS, now))
        # Bound active sessions for a personal admin account.
        conn.execute('''DELETE FROM auth_sessions WHERE admin_id=? AND token_hash NOT IN (
            SELECT token_hash FROM auth_sessions WHERE admin_id=? ORDER BY created_at DESC, rowid DESC LIMIT 5
        )''', (admin_id, admin_id))
    return token


def validate_session(token):
    if not isinstance(token, str) or not re.fullmatch(r'[0-9a-f]{64}', token):
        return None
    now = int(time.time())
    with database.get_db() as conn:
        row = conn.execute('''SELECT s.admin_id, s.expires_at, s.last_seen, a.username
            FROM auth_sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=?''',
            (digest_token(token),)).fetchone()
        if not row:
            return None
        if row['expires_at'] <= now or row['last_seen'] <= now-IDLE_SECONDS:
            conn.execute('DELETE FROM auth_sessions WHERE token_hash=?', (digest_token(token),))
            return None
        if row['last_seen'] <= now - 60:
            conn.execute('UPDATE auth_sessions SET last_seen=? WHERE token_hash=?', (now, digest_token(token)))
        return dict(row)


def delete_session(token):
    if token and re.fullmatch(r'[0-9a-f]{64}', token):
        with database.get_db() as conn:
            conn.execute('DELETE FROM auth_sessions WHERE token_hash=?', (digest_token(token),))


def allow_login(ip, username):
    """Atomic persistent budgets, charged before expensive password verification."""
    now = int(time.time())
    budgets = [('global', 60, 100), ('ip:' + ip, 600, 20), ('user:' + username.lower(), 600, 6)]
    with database.get_db() as conn:
        conn.execute('BEGIN IMMEDIATE')
        conn.execute('DELETE FROM auth_limits WHERE reset_at<=?', (now,))
        for key, window, limit in budgets:
            bucket = hashlib.sha256(key.encode()).hexdigest()
            row = conn.execute('SELECT attempts FROM auth_limits WHERE bucket=?', (bucket,)).fetchone()
            if row and row['attempts'] >= limit:
                return False
        for key, window, limit in budgets:
            bucket = hashlib.sha256(key.encode()).hexdigest()
            conn.execute('''INSERT INTO auth_limits VALUES (?, ?, 1)
                ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1''', (bucket, now+window))
    return True


class AuthMixin:
    """Put first in your HTTP request handler's base classes."""
    def client_ip(self):
        peer=self.client_address[0]
        try:
            if ipaddress.ip_address(peer).is_loopback:
                forwarded=self.headers.get('X-Forwarded-For','').split(',')[-1].strip()
                if forwarded:return str(ipaddress.ip_address(forwarded))
        except ValueError:pass
        return peer
    def _cookie_name(self):
        return '__Host-admin_session' if validate_origin().startswith('https://') else 'admin_session_local'

    def _cookie(self, token='', clear=False):
        secure = '; Secure' if validate_origin().startswith('https://') else ''
        return (f'{self._cookie_name()}={token}; Path=/; HttpOnly; SameSite=Strict'
                f'; Max-Age={0 if clear else SESSION_SECONDS}{secure}')

    def get_auth_token(self):
        # Neither Authorization nor X-Admin-Token is accepted.
        try:
            cookies = SimpleCookie(self.headers.get('Cookie', ''))
            cookie = cookies.get(self._cookie_name())
            return cookie.value if cookie else None
        except CookieError:
            return None

    def _origin_ok(self):
        return (self.headers.get('Origin') == validate_origin()
                and self.headers.get('Sec-Fetch-Site', 'same-origin') in ('same-origin', 'none')
                and self.headers.get('X-Requested-With') == 'portfolio-admin')

    def get_authenticated_user(self):
        token = self.get_auth_token()
        user = validate_session(token)
        if user and self.command not in ('GET', 'HEAD', 'OPTIONS'):
            submitted = self.headers.get('X-CSRF-Token', '')
            if not self._origin_ok() or not re.fullmatch(r'[0-9a-f]{64}', submitted) or not secrets.compare_digest(submitted, csrf_for(token)):
                return None
        return user

    def is_authenticated(self):
        return self.get_authenticated_user() is not None

    def _auth_json(self, status, data, cookie=None, retry=False):
        payload = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if cookie:
            self.send_header('Set-Cookie', cookie)
        if retry:
            self.send_header('Retry-After', '600')
        # Close after each auth response, including rejected/oversized unread bodies.
        self.send_header('Connection', 'close')
        self.end_headers()
        self.close_connection = True
        self.wfile.write(payload)

    def guard_api_write(self):
        """At top of ALL API write handlers. False means response already sent."""
        if urlsplit(self.path).path.startswith('/api/') and not self._origin_ok():
            self._auth_json(403, {'message': 'Request not allowed'})
            return False
        return True

    def handle_auth(self):
        """At top of GET/POST (and other methods). True means handled."""
        path = urlsplit(self.path).path
        if path.startswith(ADMIN_PREFIX + '/api/auth/'):
            path = path[len(ADMIN_PREFIX):]
        elif path.startswith('/api/auth/'):
            self._auth_json(404, {'message': 'Not found'})
            return True
        else:
            return False
        if not path.startswith('/api/auth/'):
            return False
        if path not in ('/api/auth/status', '/api/auth/login', '/api/auth/logout'):
            self._auth_json(404, {'message': 'Not found'})
            return True
        method = 'GET' if path.endswith('/status') else 'POST'
        if self.command != method:
            self._auth_json(405, {'message': 'Method not allowed'})
            return True
        if method == 'GET':
            user = self.get_authenticated_user()
            self._auth_json(200, {'authenticated': bool(user), 'username': user['username'] if user else None,
                                 'csrf_token': csrf_for(self.get_auth_token()) if user else None})
            return True
        if not self._origin_ok():
            self._auth_json(403, {'message': 'Request not allowed'})
            return True
        if path.endswith('/logout'):
            if not self.is_authenticated():
                self._auth_json(401, {'message': 'Sign in required'})
                return True
            safe_log_activity('logout', 'POST', '/api/auth/logout', 200, self.client_address[0])
            delete_session(self.get_auth_token())
            self._auth_json(200, {'success': True}, self._cookie(clear=True))
            return True
        if (self.headers.get('Content-Type', '').split(';')[0].strip().lower() != 'application/json'
                or self.headers.get('Transfer-Encoding')):
            self._auth_json(415, {'message': 'JSON required'})
            return True
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_BODY:
                self._auth_json(413, {'message': 'Invalid request size'})
                return True
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError()
            username, password = validate_credentials(body.get('username'), body.get('password'))
        except (ValueError, UnicodeError):
            self._auth_json(400, {'message': 'Invalid login request'})
            return True
        # Only the loopback-bound trusted reverse proxy may supply the client IP.
        if not allow_login(self.client_ip(), username):
            safe_log_activity('login_rate_limited', 'POST', '/api/auth/login', 429, self.client_address[0], input_data={'username': username})
            self._auth_json(429, {'message': 'Too many attempts. Try again in 10 minutes.'}, retry=True)
            return True
        admin = authenticate(username, password)
        if not admin:
            safe_log_activity('login_failed', 'POST', '/api/auth/login', 401, self.client_address[0], input_data={'username': username}, error_message='Incorrect credentials')
            self._auth_json(401, {'message': 'Incorrect username or password'})
            return True
        delete_session(self.get_auth_token())
        token = create_session(admin['id'], admin['password_hash'])
        if not token:
            self._auth_json(401, {'message': 'Incorrect username or password'})
            return True
        safe_log_activity('login_success', 'POST', '/api/auth/login', 200, self.client_address[0], input_data={'username': username})
        self._auth_json(200, {'success': True, 'username': admin['username'], 'csrf_token': csrf_for(token)}, self._cookie(token))
        return True
