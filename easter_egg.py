"""Server-only account summary; no galleries or external media are returned."""
import hashlib
import json
from pathlib import Path
import threading
import time
import urllib.error
import urllib.request

CONFIG_PATH = Path.home() / '.config' / 'portfolio' / 'easter-egg.json'
CHECK_URL = 'https://nhentai.net/api/v2/user'
_lock = threading.Lock()
_cache = {}
_summary_cache = {}

def _load_key():
    try:
        config = json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
        key = config.get('api_key', '') if isinstance(config, dict) else ''
    except (OSError, ValueError):
        return ''
    return key if isinstance(key, str) and key else ''

def _account_json(path, key):
    request = urllib.request.Request('https://nhentai.net/api/v2/' + path, headers={
        'Authorization': 'Key ' + key, 'Accept': 'application/json',
        'User-Agent': 'Portfolio-Account-Summary/1.0'})
    with urllib.request.build_opener(NoRedirect).open(request, timeout=6) as response:
        if response.status != 200 or response.headers.get_content_type() != 'application/json':
            raise ValueError('Unexpected service response')
        raw = response.read(256 * 1024 + 1)
        if len(raw) > 256 * 1024:
            raise ValueError('Service response too large')
        result = json.loads(raw)
        if not isinstance(result, dict):
            raise ValueError('Unexpected service response')
        return result

def get_account_summary():
    """Return text profile fields and a count; never expose galleries or media."""
    key = _load_key()
    if not key:
        return {'status': 'not_configured'}
    fingerprint = hashlib.sha256(key.encode()).hexdigest()
    with _lock:
        if _summary_cache.get('fingerprint') == fingerprint and _summary_cache.get('expires', 0) > time.monotonic():
            return dict(_summary_cache['result'])
        try:
            profile = _account_json('user', key)
            username = profile.get('username')
            user_id = profile.get('id')
            if not isinstance(username, str) or not isinstance(user_id, int) or isinstance(user_id, bool):
                raise ValueError('Unexpected account response')
            result = {'status': 'connected', 'username': username[:128], 'user_id': user_id, 'favorite_count': None, 'about': profile.get('about', '')[:500].strip() if isinstance(profile.get('about'), str) else ''}
            try:
                favorites = _account_json('favorites?page=1', key)
                total = favorites.get('total')
                if isinstance(total, int) and not isinstance(total, bool) and total >= 0:
                    result['favorite_count'] = total
                # Discard every gallery field, URL, title, tag, and thumbnail.
            except urllib.error.HTTPError as error:
                error.close()
            except (urllib.error.URLError, OSError, ValueError):
                pass
        except urllib.error.HTTPError as error:
            result = {'status': {401: 'invalid_key', 403: 'forbidden', 429: 'rate_limited'}.get(error.code, 'unavailable')}
            error.close()
        except (urllib.error.URLError, OSError, ValueError):
            result = {'status': 'unavailable'}
        _summary_cache.update(fingerprint=fingerprint, expires=time.monotonic() + 60, result=result)
        return dict(result)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def check_connection():
    key = _load_key()
    if not key:
        return {'configured': False, 'connected': False, 'status': 'not_configured'}
    fingerprint = hashlib.sha256(key.encode()).hexdigest()
    with _lock:
        now = time.monotonic()
        if _cache.get('fingerprint') == fingerprint and _cache.get('expires', 0) > now:
            return dict(_cache['result'])
        state = 'unavailable'
        request = urllib.request.Request(CHECK_URL, headers={
            'Authorization': 'Key ' + key,
            'Accept': 'application/json',
            'User-Agent': 'Portfolio-Connection-Check/1.0',
        })
        try:
            with urllib.request.build_opener(NoRedirect).open(request, timeout=6) as response:
                # Checking HTTP status verifies authentication. Profile data is
                # neither read nor returned to the browser.
                if response.status == 200 and response.headers.get_content_type() == 'application/json':
                    state = 'connected'
        except urllib.error.HTTPError as error:
            state = {401: 'invalid_key', 403: 'forbidden', 429: 'rate_limited'}.get(error.code, 'unavailable')
            error.close()
        except (urllib.error.URLError, OSError, ValueError):
            pass
        result = {'configured': True, 'connected': state == 'connected', 'status': state}
        _cache.update(fingerprint=fingerprint, expires=time.monotonic() + 30, result=result)
        return dict(result)
