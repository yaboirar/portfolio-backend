"""Regression tests using a temporary SQLite DB and real local HTTP requests."""
import contextlib
import http.client
import importlib
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import time
import types
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
db_path = ''


@contextlib.contextmanager
def get_db():
    conn = sqlite3.connect(db_path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    try:
        with conn:
            yield conn
    finally:
        conn.close()


fake_database = types.ModuleType('database')
fake_database.get_db = get_db
fake_database.log_activity = lambda *args, **kwargs: None
sys.modules['database'] = fake_database
auth = importlib.import_module('auth')


class Handler(auth.AuthMixin, BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def do_GET(self):
        if self.handle_auth():
            return
        if self.path == '/api/private':
            self._auth_json(200 if self.is_authenticated() else 401, {})
        else:
            self._auth_json(404, {})

    def do_POST(self):
        if self.handle_auth() or not self.guard_api_write():
            return
        self._auth_json(200 if self.is_authenticated() else 401, {'success': self.is_authenticated()})

    do_PUT = do_POST
    do_PATCH = do_POST
    do_DELETE = do_POST

    def log_message(self, *args):
        pass


class AuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        global db_path
        cls.tmp = tempfile.TemporaryDirectory()
        db_path = str(Path(cls.tmp.name) / 'test.sqlite')
        os.environ['PUBLIC_ORIGIN'] = 'https://portfolio.example'
        auth.init_auth()
        auth.set_admin_password('owner', 'a long private password 123')
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.tmp.cleanup()

    def setUp(self):
        with get_db() as conn:
            conn.execute('DELETE FROM auth_limits')
            conn.execute('DELETE FROM auth_sessions')

    def request(self, method, path, body=None, cookie=None, extra=None, origin='https://portfolio.example'):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=10)
        headers = {'Origin': origin, 'X-Requested-With': 'portfolio-admin', 'Content-Type': 'application/json'}
        if cookie:
            headers['Cookie'] = cookie
        headers.update(extra or {})
        connection.request(method, path, json.dumps(body) if body is not None else None, headers)
        response = connection.getresponse()
        result = (response.status, dict(response.getheaders()), json.loads(response.read()))
        connection.close()
        return result

    def login(self):
        status, headers, data = self.request('POST', '/api/auth/login', {'username': 'owner', 'password': 'a long private password 123'})
        self.assertEqual(status, 200)
        return headers['Set-Cookie'].split(';')[0], data['csrf_token'], headers, data

    def test_cookie_only_hashed_storage(self):
        cookie, csrf, headers, data = self.login()
        self.assertNotIn('token', data)
        for flag in ('HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/'):
            self.assertIn(flag, headers['Set-Cookie'])
        self.assertTrue(cookie.startswith('__Host-admin_session='))
        status, _, data = self.request('GET', '/api/auth/status', cookie=cookie)
        self.assertEqual(status, 200)
        self.assertTrue(data['authenticated'])
        self.assertEqual(data['csrf_token'], csrf)
        with get_db() as conn:
            row = conn.execute('SELECT token_hash FROM auth_sessions').fetchone()
        self.assertNotEqual(row['token_hash'], cookie.split('=')[1])

    def test_registration_and_master_headers_rejected(self):
        for method in ('GET', 'PUT', 'DELETE'):
            status, _, _ = self.request(method, '/api/auth/register', {'setup_key': 'anything'})
            self.assertIn(status, (404, 405))
        status, _, _ = self.request('POST', '/api/auth/register', {'setup_key': 'anything'})
        self.assertIn(status, (400, 403))
        cookie, _, _, _ = self.login()
        token = cookie.split('=')[1]
        for headers in ({'X-Admin-Token': token}, {'Authorization': 'Bearer ' + token}, {'Cookie': 'session_token=' + token}):
            status, _, _ = self.request('GET', '/api/private', extra=headers)
            self.assertEqual(status, 401)

    def test_csrf_and_origin_enforced_on_every_write_method(self):
        cookie, csrf, _, _ = self.login()
        for method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            self.assertEqual(self.request(method, '/api/private', cookie=cookie)[0], 401)
            self.assertEqual(self.request(method, '/api/private', cookie=cookie, extra={'X-CSRF-Token': csrf})[0], 200)
            self.assertEqual(self.request(method, '/api/private', cookie=cookie, extra={'X-CSRF-Token': csrf}, origin='https://evil.example')[0], 403)
        self.assertEqual(self.request('POST', '/api/auth/login', {'username': 'owner', 'password': 'x'}, origin='https://evil.example')[0], 403)
        self.assertEqual(self.request('POST', '/api/private', cookie=cookie, extra={'X-CSRF-Token': '\xe9'})[0], 401)

    def test_logout_revokes_cookie(self):
        cookie, csrf, _, _ = self.login()
        status, headers, _ = self.request('POST', '/api/auth/logout', cookie=cookie, extra={'X-CSRF-Token': csrf})
        self.assertEqual(status, 200)
        self.assertIn('Max-Age=0', headers['Set-Cookie'])
        self.assertEqual(self.request('GET', '/api/private', cookie=cookie)[0], 401)

    def test_rate_limit_persistent(self):
        for _ in range(6):
            self.assertEqual(self.request('POST', '/api/auth/login', {'username': 'missing', 'password': 'incorrect'})[0], 401)
        status, headers, _ = self.request('POST', '/api/auth/login', {'username': 'missing', 'password': 'incorrect'})
        self.assertEqual(status, 429)
        self.assertEqual(headers['Retry-After'], '600')
        auth.init_auth()
        self.assertFalse(auth.allow_login('127.0.0.1', 'missing'))

    def test_legacy_password_upgrades_without_reset(self):
        digest, salt = auth.hash_password('legacy secret', iterations=200_000)
        with get_db() as conn:
            conn.execute('INSERT INTO admins(username,password_hash,salt,created_at,password_iterations) VALUES(?,?,?,?,?)',
                         ('legacy', digest, salt, 'old', 200_000))
        status, _, _ = self.request('POST', '/api/auth/login', {'username': 'legacy', 'password': 'legacy secret'})
        self.assertEqual(status, 200)
        with get_db() as conn:
            row = conn.execute('SELECT password_iterations,password_hash FROM admins WHERE username=?', ('legacy',)).fetchone()
        self.assertEqual(row['password_iterations'], 600_000)
        self.assertNotEqual(row['password_hash'], digest)

    def test_expiry_and_idle_timeout(self):
        cookie, _, _, _ = self.login()
        with get_db() as conn:
            conn.execute('UPDATE auth_sessions SET expires_at=?', (int(time.time()) - 1,))
        self.assertEqual(self.request('GET', '/api/private', cookie=cookie)[0], 401)
        cookie, _, _, _ = self.login()
        with get_db() as conn:
            conn.execute('UPDATE auth_sessions SET last_seen=?', (int(time.time()) - auth.IDLE_SECONDS - 1,))
        self.assertEqual(self.request('GET', '/api/private', cookie=cookie)[0], 401)

    def test_reset_revokes_sessions_and_rejects_stale_password_result(self):
        cookie, _, _, _ = self.login()
        old_admin = auth.authenticate('owner', 'a long private password 123')
        auth.set_admin_password('owner', 'temporary reset password 456')
        self.assertEqual(self.request('GET', '/api/private', cookie=cookie)[0], 401)
        self.assertIsNone(auth.create_session(old_admin['id'], old_admin['password_hash']))
        auth.set_admin_password('owner', 'a long private password 123')

    def test_input_limits_and_generic_errors(self):
        for body in ([], {'username': 1, 'password': 'x'}, {'username': 'owner', 'password': 'x'*129}):
            self.assertEqual(self.request('POST', '/api/auth/login', body)[0], 400)
        status, _, _ = self.request('POST', '/api/auth/login', {'username': 'owner', 'password': 'x'*5000})
        self.assertEqual(status, 413)
        for name in ('owner', 'nobody'):
            status, _, data = self.request('POST', '/api/auth/login', {'username': name, 'password': 'incorrect'})
            self.assertEqual(status, 401)
            self.assertEqual(data['message'], 'Incorrect username or password')

    def test_https_required_and_local_cookie(self):
        try:
            os.environ['PUBLIC_ORIGIN'] = 'http://public.example'
            with self.assertRaises(RuntimeError):
                auth.validate_origin()
            os.environ['PUBLIC_ORIGIN'] = 'http://127.0.0.1:8080'
            handler = object.__new__(Handler)
            self.assertIn('admin_session_local=', handler._cookie('abc'))
            self.assertNotIn('; Secure', handler._cookie('abc'))
        finally:
            os.environ['PUBLIC_ORIGIN'] = 'https://portfolio.example'

    def test_migration_preserves_admins_and_revokes_legacy_sessions(self):
        with get_db() as conn:
            conn.execute('CREATE TABLE IF NOT EXISTS sessions (token TEXT)')
            conn.execute('INSERT INTO sessions VALUES (?)', ('legacy-raw-token',))
            before = conn.execute('SELECT COUNT(*) FROM admins').fetchone()[0]
        auth.init_auth()
        auth.init_auth()
        with get_db() as conn:
            self.assertEqual(conn.execute('SELECT COUNT(*) FROM admins').fetchone()[0], before)
            self.assertEqual(conn.execute('SELECT COUNT(*) FROM sessions').fetchone()[0], 0)


if __name__ == '__main__':
    unittest.main()
