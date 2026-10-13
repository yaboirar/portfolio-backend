"""Failure recovery, real media, and multipart regression checks."""
import io
import json
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import database
import server
from upload_parser import parse_upload


def form(payload, ending=b'\r\n--B--\r\n', headers=None):
    headers = headers or b'Content-Disposition: form-data; name="file"; filename="x.mp4"'
    return b'--B\r\n' + headers + b'\r\n\r\n' + payload + ending


def parse(body, read_size=65536, **limits):
    class Reader:
        def __init__(self): self.stream = io.BytesIO(body)
        def read(self, n): return self.stream.read(min(n, read_size))
    output = io.BytesIO()
    fields, filename = parse_upload(Reader(), 'multipart/form-data; boundary=B', len(body), output,
        video_exts={'.mp4'}, image_exts={'.png'}, video_limit=1000000,
        image_limit=10000, **limits)
    return fields, filename, output.getvalue()


class BackendRegressionTests(unittest.TestCase):
    def test_boundary_chunk_splits_and_false_prefixes(self):
        payload = b'\x00\xffAAA\r\n--BXYZ\r\nBBB\r\n--B--XYZ\r\nEND'
        for size in range(1, 65):
            with self.subTest(read_size=size):
                self.assertEqual(parse(form(payload), size)[2], payload)

    def test_closing_boundary_at_eof(self):
        self.assertEqual(parse(form(b'payload', b'\r\n--B--'), 1)[2], b'payload')

    def test_missing_closing_boundary(self):
        with self.assertRaises(ValueError): parse(form(b'payload', b''))

    def test_complete_epilogue_and_truncated_transport(self):
        body = form(b'payload') + b' ' * 200000
        self.assertEqual(parse(body)[2], b'payload')
        with self.assertRaises(ConnectionResetError):
            parse_upload(io.BytesIO(body), 'multipart/form-data; boundary=B', len(body) + 1,
                io.BytesIO(), video_exts={'.mp4'}, image_exts={'.png'},
                video_limit=1000000, image_limit=10000)

    def test_part_headers_and_field_limits(self):
        with self.assertRaises(ValueError): parse(form(b'x', headers=b'X: '+b'A'*5000))
        field = b'--B\r\nContent-Disposition: form-data; name="title"\r\n\r\n' + b'A'*10241
        with self.assertRaises(ValueError): parse(field + b'\r\n' + form(b'file'))
        with self.assertRaises(ValueError): parse(form(b'file'), part_limit=0)

    def test_multiple_files_rejected(self):
        with self.assertRaises(ValueError):
            parse(form(b'first', b'\r\n') + form(b'second'))

    def test_cleanup_preserves_record_on_unlink_failure_and_retries(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); uploads = root / 'uploads'; uploads.mkdir()
            asset = uploads / 'x.mp4'; asset.write_bytes(b'file')
            with patch.object(database, 'DB_PATH', str(root / 'test.db')):
                database.init_db()
                row = database.create_media('test', '', 'video', 'x.mp4', '/uploads/x.mp4', 4, 'video/mp4')
                database.mark_media_pending_delete(row['id'])
                with patch.object(Path, 'unlink', side_effect=PermissionError('locked')):
                    self.assertEqual(database.cleanup_unfinished_deletions(uploads), 0)
                self.assertTrue(asset.exists())
                self.assertEqual(len(database.get_all_pending_deletions()), 1)
                self.assertFalse(database.is_media_active_by_url('/uploads/x.mp4'))
                self.assertEqual(database.cleanup_unfinished_deletions(uploads), 1)
                self.assertFalse(asset.exists())
                self.assertEqual(database.get_all_pending_deletions(), [])

    def test_video_stubs_and_trackless_container_rejected(self):
        ftyp = struct.pack('>I4s4sI', 20, b'ftyp', b'mp42', 0) + b'mp42'
        mvhd = struct.pack('>I4sIIIIII', 32, b'mvhd', 0, 0, 0, 1000, 1000, 0x10000)
        trackless = ftyp + struct.pack('>I4s', 8+len(mvhd), b'moov') + mvhd
        with tempfile.TemporaryDirectory() as folder:
            for ext, payload in [('.mp4', b'0000ftyp'), ('.mp4', trackless),
                                 ('.webm', b'\x1a\x45\xdf\xa3webm'+b'x'*24)]:
                with self.subTest(extension=ext, length=len(payload)):
                    path = Path(folder) / ('stub' + ext); path.write_bytes(payload)
                    with self.assertRaises(ValueError): server.validate_video_file(path, ext)

    def test_real_video_tracks_without_audio(self):
        with tempfile.TemporaryDirectory() as folder:
            for ext, codec in [('.mp4', 'libx264'), ('.mov', 'libx264'), ('.webm', 'libvpx-vp9')]:
                with self.subTest(extension=ext):
                    path = Path(folder) / ('video' + ext)
                    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
                        'color=c=blue:s=160x90:d=1', '-c:v', codec, '-an', '-y', str(path)],
                        check=True, timeout=30)
                    self.assertGreater(server.validate_video_file(path, ext), 0)
                    info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error',
                        '-show_streams', '-of', 'json', str(path)]))
                    self.assertFalse(any(s['codec_type']=='audio' for s in info['streams']))

    def test_video_probe_timeout_has_clear_error(self):
        with patch.object(subprocess, 'run', side_effect=subprocess.TimeoutExpired('ffprobe', 15)):
            with self.assertRaisesRegex(ValueError, 'time limit'):
                server.validate_video_file(Path('probe.mp4'), '.mp4')

    def test_cleanup_keeps_recent_temporary_files(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'active'; path.write_bytes(b'in progress')
            self.assertEqual(server.cleanup_orphaned_tmp_files(Path(folder)), 0)
            self.assertTrue(path.exists())


if __name__ == '__main__': unittest.main()
