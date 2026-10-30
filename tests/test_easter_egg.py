import email.message
import json
from pathlib import Path
import tempfile
import sys
import unittest
from unittest.mock import MagicMock, patch
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import easter_egg

class ConnectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'config.json'
        self.path.write_text(json.dumps({'api_key': 'test-secret-key'}))
        self.config = patch.object(easter_egg, 'CONFIG_PATH', self.path)
        self.config.start()
        easter_egg._cache.clear()
        easter_egg._summary_cache.clear()

    def tearDown(self):
        self.config.stop()
        self.tmp.cleanup()

    def test_authenticates_without_reading_profile_and_caches_result(self):
        headers = email.message.Message()
        headers['Content-Type'] = 'application/json'
        response = MagicMock(status=200, headers=headers)
        response.__enter__.return_value = response
        opener = MagicMock()
        opener.open.return_value = response
        with patch.object(easter_egg.urllib.request, 'build_opener', return_value=opener):
            self.assertTrue(easter_egg.check_connection()['connected'])
            self.assertTrue(easter_egg.check_connection()['connected'])
        opener.open.assert_called_once()
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, 'https://nhentai.net/api/v2/user')
        self.assertEqual(request.get_header('Authorization'), 'Key test-secret-key')
        response.read.assert_not_called()
        self.assertNotIn('test-secret-key', json.dumps(easter_egg.check_connection()))

    def test_errors_report_truthful_status_without_leaking_details(self):
        for code, state in ((401, 'invalid_key'), (403, 'forbidden'), (429, 'rate_limited'), (500, 'unavailable'), (302, 'unavailable')):
            easter_egg._cache.clear()
            opener = MagicMock()
            opener.open.side_effect = urllib.error.HTTPError(easter_egg.CHECK_URL, code, 'secret detail', {}, None)
            with patch.object(easter_egg.urllib.request, 'build_opener', return_value=opener):
                result = easter_egg.check_connection()
            self.assertEqual(result['status'], state)
            self.assertFalse(result['connected'])
            self.assertNotIn('secret', json.dumps(result))

    def test_missing_key_never_contacts_service(self):
        self.path.unlink()
        with patch.object(easter_egg.urllib.request, 'build_opener') as opener:
            self.assertEqual(easter_egg.check_connection()['status'], 'not_configured')
        opener.assert_not_called()

    def test_profile_returns_identity_and_count_only(self):
        profile = {'id': 7, 'username': 'Example', 'avatar_url': 'https://private.invalid/avatar', 'email': 'private@example.invalid', 'about': '  Example profile bio  '}
        favorites = {'total': 42, 'result': [{'title': 'Private title', 'url': 'https://private.invalid/file'}]}
        with patch.object(easter_egg, '_account_json', side_effect=[profile, favorites]) as request:
            result = easter_egg.get_account_summary()
            self.assertEqual(result, {'status': 'connected', 'username': 'Example', 'user_id': 7, 'favorite_count': 42, 'about': 'Example profile bio'})
            self.assertEqual(easter_egg.get_account_summary(), result)
            self.assertEqual(request.call_count, 2)
        self.assertNotIn('private', json.dumps(result).lower())

    def test_profile_bio_is_bounded_and_non_text_values_are_ignored(self):
        for raw,expected in [(' x '*400,(' x '*400)[:500].strip()),(None,''),({'html':'not accepted'},'')]:
            easter_egg._summary_cache.clear()
            with patch.object(easter_egg,'_account_json',side_effect=[{'id':7,'username':'Example','about':raw},{'total':0}]):
                result=easter_egg.get_account_summary()
            self.assertEqual(result['about'],expected)
            self.assertEqual(set(result),{'status','username','user_id','favorite_count','about'})

    def test_boolean_account_id_is_rejected(self):
        with patch.object(easter_egg,'_account_json',return_value={'id':True,'username':'Example'}):
            self.assertEqual(easter_egg.get_account_summary(),{'status':'unavailable'})
