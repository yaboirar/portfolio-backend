"""Creative portfolio API: SQLite metadata, streamed uploads, and media files.

Multipart decoding uses Werkzeug with bounded fields, headers, and file sizes.
Pillow normalizes image orientation. FFprobe checks video containers and tracks.
Run behind a production HTTPS proxy before exposing this development server.
"""

import os
import sys
import time
import json
import mimetypes
import urllib.parse
import re
import socketserver
import threading
import email.utils
import html
import secrets
import subprocess
import math
import tempfile
import shutil
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from http.cookies import SimpleCookie
from typing import Optional, Tuple, Dict, Any

from PIL import Image, ImageOps, UnidentifiedImageError
from upload_parser import parse_upload

import database
import auth
import easter_egg
import video_thumbnails
import storage_guard
import media_jobs
import media_metadata
import media_storage
import share_access

# Configure Pillow limits to protect against decompression bombs
Image.MAX_IMAGE_PIXELS = 50_000_000

BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
VIDEOS_DIR = UPLOADS_DIR / "videos"
IMAGES_DIR = UPLOADS_DIR / "images"
STATIC_DIR = BASE_DIR / "static"
PUBLIC_DIR = BASE_DIR / "public_site"
TMP_DIR = BASE_DIR / ".tmp_uploads"

for d in (UPLOADS_DIR, VIDEOS_DIR, IMAGES_DIR, STATIC_DIR, TMP_DIR):
    d.mkdir(parents=True, exist_ok=True)

mimetypes.add_type("application/vnd.apple.mpegurl", ".m3u8")
mimetypes.add_type("video/mp2t", ".ts")

ALLOWED_VIDEO_EXTS = {".mp4", ".webm", ".mov"}
ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_EXTS = ALLOWED_VIDEO_EXTS | ALLOWED_IMAGE_EXTS

MAX_VIDEO_SIZE = 500 * 1024 * 1024     # 500 MB
MAX_IMAGE_SIZE = 25 * 1024 * 1024       # 25 MB
MAX_GLOBAL_UPLOAD = 550 * 1024 * 1024   # 550 MB
MAX_FIELD_LEN = 10 * 1024               # 10 KB per text field
MAX_PARTS = 10                          # Max multipart form fields
MAX_PART_HEADER_LEN = 4096              # Max header bytes per part
CHUNK_SIZE = 64 * 1024                  # 64 KB streaming buffer

mimetypes.init()
mimetypes.add_type("video/mp4", ".mp4")
mimetypes.add_type("video/webm", ".webm")
mimetypes.add_type("video/quicktime", ".mov")
mimetypes.add_type("image/jpeg", ".jpg")
mimetypes.add_type("image/jpeg", ".jpeg")
mimetypes.add_type("image/png", ".png")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")


# --- Media Inspection & Validation ---

def validate_and_sanitize_image(input_path: Path, output_path: Path, ext: str) -> Tuple[int, int, int]:
    """Validate supported images, then preserve the exact original bytes and metadata."""
    expected = {'.jpg': 'JPEG', '.jpeg': 'JPEG', '.png': 'PNG', '.webp': 'WEBP'}.get(ext.lower())
    try:
        with Image.open(input_path, formats=[expected]) as image:
            width, height = image.size
            if image.format != expected or not expected:
                raise ValueError('Image format does not match its extension')
            if width > 8192 or height > 8192 or width * height > Image.MAX_IMAGE_PIXELS:
                raise ValueError('Image dimensions exceed the supported limit')
            image.verify()
        shutil.copyfile(input_path, output_path)
        return output_path.stat().st_size, width, height
    except (OSError, SyntaxError, ValueError, Image.DecompressionBombError) as error:
        raise ValueError('Corrupt or unsupported image') from error


def validate_video_file(file_path: Path, ext: str, metadata=None) -> float:
    """Inspect real video tracks with FFprobe; this does not decode every frame."""
    if ext.lower() not in ALLOWED_VIDEO_EXTS:
        raise ValueError("Unsupported video format")
    command = ["ffprobe", "-v", "error", "-protocol_whitelist", "file",
               "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,width,height,duration",
               "-of", "json", str(file_path)]
    try:
        with tempfile.TemporaryFile() as output:
            result = media_jobs.run(command, stdout=output, stderr=subprocess.DEVNULL, timeout=15, check=False)
            output.seek(0)
            result.stdout = output.read(1024 * 1024 + 1)
    except FileNotFoundError as exc:
        raise ValueError("FFprobe is required for video uploads; install FFmpeg") from exc
    except subprocess.TimeoutExpired as exc:
        raise ValueError("Video inspection exceeded its time limit") from exc
    if result.returncode != 0 or len(result.stdout) > 1024 * 1024:
        raise ValueError("Corrupt or unsupported video container")
    try:
        info = json.loads(result.stdout)
        formats = set(info.get("format", {}).get("format_name", "").split(","))
        allowed = {"matroska", "webm"} if ext.lower() == ".webm" else {"mov", "mp4"}
        if not formats & allowed:
            raise ValueError("Video container does not match its extension")
        tracks = [track for track in info.get("streams", [])
                  if track.get("codec_type") == "video" and track.get("codec_name")
                  and int(track.get("width", 0)) > 0 and int(track.get("height", 0)) > 0]
        if not tracks:
            raise ValueError("File contains no usable video track")
        duration = info.get("format", {}).get("duration")
        if duration is None:
            duration = next((track.get("duration") for track in tracks if track.get("duration")), None)
        seconds = float(duration)
        if not math.isfinite(seconds) or seconds <= 0:
            raise ValueError("Video must have a positive finite duration")
        if metadata is not None:metadata.update(width=int(tracks[0]['width']),height=int(tracks[0]['height']),duration_seconds=seconds)
        return seconds
    except (TypeError, KeyError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid video inspection result") from exc


def transcode_video_to_hls(input_path: Path, hls_dir: Path) -> Optional[Tuple[str, int]]:
    """Convert uploaded video to HLS (.m3u8 + .ts segments) to prevent single-file downloads.
    Returns (relative_url, total_bytes) on success, or None on failure.
    """
    try:
        hls_dir.mkdir(parents=True, exist_ok=True)
        playlist = hls_dir / "index.m3u8"

        # Attempt 1: Fast stream copy with full metadata scrub (instant, lossless)
        cmd_copy = [
            "ffmpeg", "-y", "-i", str(input_path),
            "-map_metadata", "-1",
            "-fflags", "+bitexact",
            "-flags:v", "+bitexact",
            "-flags:a", "+bitexact",
            "-codec:", "copy",
            "-start_number", "0",
            "-hls_time", "3",
            "-hls_list_size", "0",
            "-f", "hls",
            str(playlist)
        ]
        res_copy = subprocess.run(cmd_copy, capture_output=True, timeout=120, check=False)

        # If copy fails or stream isn't playable across all browsers, transcode to standard h264/aac
        if res_copy.returncode != 0 or not playlist.is_file():
            cmd_transcode = [
                "ffmpeg", "-y", "-i", str(input_path),
                "-map_metadata", "-1",
                "-fflags", "+bitexact",
                "-flags:v", "+bitexact",
                "-flags:a", "+bitexact",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                "-c:a", "aac", "-b:a", "128k",
                "-start_number", "0",
                "-hls_time", "3",
                "-hls_list_size", "0",
                "-f", "hls",
                str(playlist)
            ]
            res_trans = subprocess.run(cmd_transcode, capture_output=True, timeout=300, check=False)
            if res_trans.returncode != 0 or not playlist.is_file():
                return None

        total_bytes = sum(f.stat().st_size for f in hls_dir.iterdir() if f.is_file())
        rel_url = f"/uploads/videos/{hls_dir.name}/index.m3u8"
        return rel_url, total_bytes
    except Exception:
        return None


def sanitize_video_metadata(file_path: Path) -> None:
    """Strips all internal container metadata (creation time, GPS, encoder, software) from video file."""
    try:
        clean_tmp = file_path.with_suffix(".clean" + file_path.suffix)
        cmd = [
            "ffmpeg", "-y", "-i", str(file_path),
            "-map_metadata", "-1",
            "-fflags", "+bitexact",
            "-flags:v", "+bitexact",
            "-flags:a", "+bitexact",
            "-codec:", "copy",
            str(clean_tmp)
        ]
        res = subprocess.run(cmd, capture_output=True, timeout=120, check=False)
        if res.returncode == 0 and clean_tmp.is_file() and clean_tmp.stat().st_size > 0:
            clean_tmp.replace(file_path)
        else:
            if clean_tmp.is_file():
                clean_tmp.unlink()
    except Exception:
        pass


# --- Path Resolution & Containment Helper ---

def resolve_safe_path(base_dir: Path, rel_path: str) -> Optional[Path]:
    try:
        base = base_dir.resolve()
        target = (base / rel_path.lstrip("/")).resolve()
        if target.is_file() and target.is_relative_to(base):
            return target
    except (ValueError, RuntimeError):
        pass
    return None


# --- Cleanup & Recovery Utilities ---

def cleanup_orphaned_tmp_files(tmp_dir: Path, max_age_seconds: int = 3600) -> int:
    """Removes any orphaned temp files in .tmp_uploads older than max_age_seconds."""
    now = time.time()
    count = 0
    if not tmp_dir.is_dir():
        return 0
    for item in tmp_dir.iterdir():
        if item.is_file():
            try:
                if now - item.stat().st_mtime > max_age_seconds:
                    item.unlink()
                    count += 1
            except OSError:
                pass
    return count


# --- RFC 9110 Range Header Parsing ---

def parse_byte_range(range_header: str, total_size: int) -> Optional[Tuple[int, int]]:
    if not range_header or not range_header.startswith("bytes="):
        return None
    val = range_header[6:].strip()
    if val.startswith("-"):
        try:
            suffix = int(val[1:])
            if suffix <= 0:
                return None
            return (max(0, total_size - suffix), total_size - 1)
        except ValueError:
            return None
    if "-" in val:
        parts = val.split("-", 1)
        try:
            start = int(parts[0])
            if start < 0 or start >= total_size:
                return None
            if parts[1].strip():
                end = min(int(parts[1]), total_size - 1)
                if end < start:
                    return None
            else:
                end = total_size - 1
            return (start, end)
        except ValueError:
            return None
    return None


class ThreadingHTTPServer(socketserver.ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128

    def __init__(self, *args, **kwargs):
        self._capacity = threading.BoundedSemaphore(32)
        super().__init__(*args, **kwargs)

    def process_request(self, request, client_address):
        if not self._capacity.acquire(blocking=False):
            try:
                request.sendall(b'HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\nRetry-After: 1\r\n\r\n')
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self._capacity.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._capacity.release()


class PortfolioHandler(auth.AuthMixin, BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def setup(self):
        super().setup()
        self.connection.settimeout(15.0)

    def log_message(self, format, *args):
        clean_path = re.sub(r'(/videoshared/)[^/]+',r'\1[redacted]',urllib.parse.urlparse(self.path).path)
        sys.stdout.write(f"[{self.log_date_time_string()}] {self.command} {clean_path} -> {args[1] if len(args) > 1 else ''}\n")
        sys.stdout.flush()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Allow", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.end_headers()

    def send_cors_headers(self):

        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range, X-Requested-With, X-CSRF-Token")
        self.send_header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Content-Security-Policy", "default-src 'none'; connect-src 'self'; media-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")
        if self.close_connection:
            self.send_header("Connection", "close")

    def require_auth(self) -> bool:
        if not self.is_authenticated():
            self.send_error_json(401, "Sign in required")
            return False
        return True

    def redirect_page(self, location: str):
        self.send_response(303)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def send_json(self, status_code: int, data: any, extra_headers: Optional[Dict[str, str]] = None):
        payload = json.dumps(data, indent=2).encode("utf-8")
        private_response = urllib.parse.urlparse(self.path).path != "/api/health"
        self.send_response(status_code)
        self.send_cors_headers()
        if private_response:
            self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(payload)

    def send_error_json(self, status_code: int, message: str):
        self.send_json(status_code, {"error": True, "message": message})

    def parse_json_body(self) -> dict:
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length <= 0:
            return {}
        if content_length > 1 * 1024 * 1024:  # 1 MB max for JSON
            self.close_connection = True
            raise ValueError("JSON payload too large")
        raw = self.rfile.read(content_length)
        return json.loads(raw.decode("utf-8"))

    def serve_file_with_range(self, filepath: Path, head_only: bool = False, budget=None):
        stat = filepath.stat()
        total_size = stat.st_size
        mime_type = {'.ts': 'video/mp2t', '.m3u8': 'application/vnd.apple.mpegurl'}.get(filepath.suffix.lower())
        mime_type = mime_type or mimetypes.guess_type(str(filepath))[0] or 'application/octet-stream'
        html = filepath.suffix.lower() in {'.html', '.htm'}
        cache = 'private, no-store' if html else 'private, no-cache, must-revalidate'
        etag = f'"{stat.st_mtime_ns:x}-{total_size:x}"'
        modified = email.utils.formatdate(stat.st_mtime, usegmt=True)
        match = self.headers.get('If-None-Match')
        if not html and match and (match.strip() == '*' or etag in [part.strip().removeprefix('W/') for part in match.split(',')]):
            self.send_response(304)
            self.send_cors_headers()
            self.send_header('ETag', etag)
            self.send_header('Cache-Control', cache)
            self.end_headers()
            return
        range_header = self.headers.get('Range')
        if_range = self.headers.get('If-Range')
        if if_range and if_range not in (etag, modified):
            range_header = None
        selected = parse_byte_range(range_header, total_size) if range_header else None
        if range_header and selected is None:
            self.send_response(416)
            self.send_cors_headers()
            self.send_header('Content-Range', f'bytes */{total_size}')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        start, end = selected if selected else (0, total_size - 1)
        length = max(0, end - start + 1)
        if budget and not head_only and length and not budget.reserve(length):return
        self.send_response(206 if selected else 200)
        self.send_cors_headers()
        self.send_header('Content-Type', mime_type)
        self.send_header('Content-Length', str(length))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', cache)
        self.send_header('ETag', etag)
        self.send_header('Last-Modified', modified)
        if selected:
            self.send_header('Content-Range', f'bytes {start}-{end}/{total_size}')
        self.end_headers()
        if head_only or not length:
            return
        sent=0
        try:
            self.wfile.flush()
            with filepath.open('rb') as source:
                try:self.connection.sendfile(source,offset=start,count=length)
                finally:sent=max(0,min(length,source.tell()-start))
        except (BrokenPipeError,ConnectionResetError,TimeoutError,OSError):
            self.close_connection=True
        finally:
            if budget:budget.finish(sent)

    def media_payload(self, item):
        result = dict(item)
        root=VIDEOS_DIR if item['media_type']=='video' else IMAGES_DIR
        original=resolve_safe_path(root,item['filename']) if Path(item['filename']).name==item['filename'] else None
        if original:media_metadata.schedule(item,original)
        if result.get('media_type') == 'video':
            filename = result.get('filename', '')
            original = resolve_safe_path(VIDEOS_DIR, filename) if filename and Path(filename).name == filename else None
            if original and original.is_file():
                result['original_url'] = '/uploads/videos/' + filename
                result['original_size'] = original.stat().st_size
                result['thumbnail_url'] = f'/api/media/{item["id"]}/thumbnail'
        return result

    def do_HEAD(self):
        self.do_GET(head_only=True)

    def do_GET(self, head_only: bool = False):
        if self.handle_auth():
            return

        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if share_access.handle_get(self,path,head_only=head_only):return
        if path == "/api/health":
            self.send_json(200, {"status": "ok", "service": "Portfolio Creative Backend", "version": "2.0.0"})
            return

        if path == auth.ADMIN_PREFIX + "/easter-egg":
            if not self.require_auth():
                return
            self.redirect_page("/MILV67/easter-egg")
            return

        # The backend is private. Publishing read endpoints for a future public
        # portfolio must be an explicit decision, including direct media URLs.
        if path.startswith(("/api/", "/uploads/")) and not self.require_auth():
            return

        if share_access.handle_owner(self,path):return
        if path == '/api/storage':
            self.send_json(200,storage_guard.stats());return
        if path == "/api/stats":
            self.send_json(200, database.get_stats())
            return

        if path == "/api/folders":
            self.send_json(200, {"folders": database.get_folders()})
            return

        if path == '/api/notifications':
            self.send_json(200, database.get_notifications())
            return

        if path == "/api/poems":
            tag = query.get("tag", [None])[0]
            poems = database.get_all_poems(tag=tag)
            self.send_json(200, {"count": len(poems), "poems": poems})
            return

        poem_match = re.match(r"^/api/poems/(\d+)$", path)
        if poem_match:
            poem_id = int(poem_match.group(1))
            poem = database.get_poem_by_id(poem_id)
            if poem:
                self.send_json(200, poem)
            else:
                self.send_error_json(404, "Poem not found")
            return

        if path == "/api/media":
            media_type = query.get("type", [None])[0]
            items = [self.media_payload(item) for item in database.get_all_media(media_type=media_type)]
            self.send_json(200, {"count": len(items), "media": items})
            return

        thumbnail_match = re.fullmatch(r'/api/media/(\d+)/thumbnail', path)
        if thumbnail_match:
            item = database.get_media_by_id(int(thumbnail_match.group(1)))
            original = resolve_safe_path(VIDEOS_DIR, item['filename']) if item and item['media_type'] == 'video' and Path(item['filename']).name == item['filename'] else None
            if not original or not original.is_file():
                self.send_error_json(404, 'Preview unavailable')
                return
            thumbnail = video_thumbnails.request_thumbnail(item['id'], original)
            if thumbnail:
                self.serve_file_with_range(thumbnail, head_only=head_only)
            else:
                self.send_response(202)
                self.send_cors_headers()
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Retry-After', '2')
                self.send_header('Content-Length', '0')
                self.end_headers()
            return

        media_match = re.match(r"^/api/media/(\d+)$", path)
        if media_match:
            media_id = int(media_match.group(1))
            media_item = database.get_media_by_id(media_id)
            if media_item:
                self.send_json(200, self.media_payload(media_item))
            else:
                self.send_error_json(404, "Media not found")
            return

        if path == "/api/admin/easter-egg/status":
            if not self.require_auth():
                return
            self.send_json(200, easter_egg.check_connection())
            return

        if path == "/api/admin/easter-egg/profile":
            if not self.require_auth():
                return
            self.send_json(200, easter_egg.get_account_summary())
            return

        if path == "/api/admin/logs":
            if not self.require_auth():
                return
            logs = database.get_recent_activity_logs(limit=150)
            self.send_json(200, {
                "success": True,
                "count": len(logs),
                "retention_days": 7,
                "logs": logs
            })
            return

        if path.startswith("/uploads/"):
            rel_path = path[len("/uploads/"):].lstrip("/")
            safe_target = resolve_safe_path(UPLOADS_DIR, rel_path)
            if not safe_target:
                self.send_error_json(404, "Uploaded asset not found")
                return

            # Status-aware serving: verify asset has an active record in SQLite
            clean_url = urllib.parse.unquote(path)
            if not (database.is_media_active_by_url(path) or database.is_media_active_by_url(clean_url)):
                self.send_error_json(404, "Uploaded asset not found or no longer active")
                return

            self.serve_file_with_range(safe_target, head_only=head_only)
            return

        if path == "/":
            self.serve_file_with_range(PUBLIC_DIR / "index.html", head_only=head_only)
            return

        if path.startswith("/public/"):
            safe_public = resolve_safe_path(PUBLIC_DIR, path[len("/public/"):])
            if safe_public:
                self.serve_file_with_range(safe_public, head_only=head_only)
            else:
                self.send_error_json(404, "Not found")
            return

        admin_login = auth.ADMIN_PREFIX
        admin_dashboard = "/MILV67"
        if path == admin_login + "/":
            self.redirect_page(admin_login)
            return

        login_assets = {
            admin_login + "/assets/auth-ui.js": STATIC_DIR / "auth-ui.js",
            admin_login + "/assets/auth-ui.css": STATIC_DIR / "auth-ui.css",
        }
        if path in login_assets:
            self.serve_file_with_range(login_assets[path], head_only=head_only)
            return

        if path in (admin_login, admin_dashboard, admin_dashboard + "/easter-egg"):
            user = self.get_authenticated_user()
            if path.startswith(admin_dashboard) and not user:
                self.redirect_page(admin_login)
                return
            if path == admin_login and user:
                self.redirect_page(admin_dashboard)
                return
            safe_index = resolve_safe_path(STATIC_DIR, "login.html" if path == admin_login else "index.html")
            if safe_index:
                self.serve_file_with_range(safe_index, head_only=head_only)
                return

        if path.startswith("/static/"):
            rel_path = path[len("/static/"):].lstrip("/")
            safe_target = resolve_safe_path(STATIC_DIR, rel_path)
            if safe_target:
                if not self.require_auth():
                    return
                self.serve_file_with_range(safe_target, head_only=head_only)
                return
            else:
                self.send_error_json(404, "Static asset not found")
                return

        self.send_error_json(404, f"Endpoint {path} not found")

    def handle_folder_write(self, path):
        match = re.fullmatch(r'/api/folders/(\d+)', path)
        if path not in ('/api/folders', '/api/folders/move') and not match:
            return False
        if not self.require_auth():
            return True
        folder_id = int(match.group(1)) if match else None
        try:
            if self.command == 'DELETE' and match:
                database.delete_folder(folder_id)
                result, status = {'success': True}, 200
            elif self.command == 'POST' and path == '/api/folders/move':
                body = self.parse_json_body()
                if not isinstance(body, dict) or 'folder_id' not in body:
                    raise ValueError('Choose a destination folder')
                result, status = {'moved': database.move_folder_items(body.get('items'), body['folder_id'])}, 200
            elif (self.command == 'POST' and path == '/api/folders') or (self.command == 'PATCH' and match):
                body = self.parse_json_body()
                if not isinstance(body, dict):
                    raise ValueError('Invalid folder details')
                result, status = database.save_folder(body.get('name'), folder_id, tag=body.get('tag'), description=body.get('description'), color=body.get('color')), 201 if folder_id is None else 200
            else:
                self.send_error_json(405, 'Method not allowed')
                return True
            database.log_activity('organize_folders', self.command, path, status, self.client_address[0], input_data={'folder_id': folder_id})
            self.send_json(status, result)
        except (ValueError, TypeError):
            self.send_error_json(400, str(sys.exc_info()[1]))
        return True

    def do_POST(self):
        # Rejected writes may leave an unread body. Never let a proxy reuse that
        # connection and interpret the remaining bytes as another request.
        self.close_connection = True
        if self.handle_auth():
            return
        if not self.guard_api_write():
            return

        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        if share_access.handle_owner(self,path):return
        if self.handle_folder_write(path):
            return
        if path in ('/api/notifications', '/api/notifications/read'):
            if not self.require_auth():
                return
            try:
                body = self.parse_json_body()
                if not isinstance(body, dict):
                    raise ValueError('Invalid notification details')
                if path.endswith('/read'):
                    if 'id' in body:
                        database.read_notification(body['id'])
                    else:
                        database.read_notifications(body.get('through_id'))
                    self.send_json(200, database.get_notifications())
                else:
                    self.send_json(201, database.create_notification(body.get('title'), body.get('message', ''), body.get('level', 'success')))
            except (ValueError, TypeError) as error:
                self.send_error_json(400, str(error))
            return

        # Check for chunked transfer-encoding
        transfer_encoding = self.headers.get("Transfer-Encoding", "").lower()
        if "chunked" in transfer_encoding:
            self.close_connection = True
            self.send_error_json(400, "Chunked transfer encoding is not supported; Content-Length header is required")
            return

        if path == "/api/poems":
            if not self.require_auth():
                return
            try:
                body = self.parse_json_body()
                title = body.get("title")
                content = body.get("content")
                if not title or not content:
                    self.send_error_json(400, "Fields 'title' and 'content' are required")
                    return
                if len(title) > MAX_FIELD_LEN or len(content) > 100 * 1024:
                    self.send_error_json(400, "Poem fields exceed maximum allowed character limits")
                    return
                mood = body.get("mood", "reflective")
                tags = body.get("tags", "")
                created = database.create_poem(title, content, mood, tags, folder_id=body.get('folder_id'))
                database.log_activity("create_poem", "POST", path, 201, self.client_address[0], input_data={"title": title, "mood": mood, "tags": tags}, output_data=created)
                self.send_json(201, created)
            except Exception as e:
                self.send_error_json(400, f"Invalid request: {str(e)}")
            return

        if path == "/api/upload":
            if not self.require_auth():
                return
            self.handle_multipart_upload()
            return

        if path == "/api/upload/raw":
            if not self.require_auth():
                return
            self.handle_raw_stream_upload(query)
            return

        if path == "/api/admin/cleanup":
            if not self.require_auth():
                return
            cleaned_tmp = cleanup_orphaned_tmp_files(TMP_DIR)
            cleaned_del = database.cleanup_unfinished_deletions(UPLOADS_DIR)
            self.send_json(200, {
                "success": True,
                "cleaned_temp_files": cleaned_tmp,
                "cleaned_pending_deletions": cleaned_del
            })
            return

        self.send_error_json(404, f"Endpoint {path} not found")

    def do_PUT(self):
        self.close_connection = True
        if self.handle_auth():
            return
        if not self.guard_api_write():
            return

        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        poem_match = re.match(r"^/api/poems/(\d+)$", path)
        if poem_match:
            if not self.require_auth():
                return
            poem_id = int(poem_match.group(1))
            try:
                body = self.parse_json_body()
                title = body.get("title")
                content = body.get("content")
                if not title or not content:
                    self.send_error_json(400, "Fields 'title' and 'content' are required")
                    return
                mood = body.get("mood", "reflective")
                tags = body.get("tags", "")
                updated = database.update_poem(poem_id, title, content, mood, tags)
                if updated:
                    database.log_activity("update_poem", "PUT", path, 200, self.client_address[0], input_data={"poem_id": poem_id, "title": title, "mood": mood}, output_data=updated)
                    self.send_json(200, updated)
                else:
                    self.send_error_json(404, "Poem not found")
            except Exception as e:
                self.send_error_json(400, f"Invalid request: {str(e)}")
            return

        self.send_error_json(404, f"Endpoint {path} not found")

    def do_PATCH(self):
        self.close_connection = True
        if self.handle_auth():
            return
        if not self.guard_api_write():
            return
        path = urllib.parse.urlparse(self.path).path
        if share_access.handle_owner(self,path):return
        if self.handle_folder_write(path):
            return
        media_match = re.fullmatch(r"/api/media/(\d+)", path)
        if media_match:
            if not self.require_auth():
                return
            try:
                body = self.parse_json_body()
                if not isinstance(body, dict):
                    self.send_error_json(400, "Metadata must be an object")
                    return
                title, description = body.get("title"), body.get("description", "")
                if not isinstance(title, str) or not title.strip() or len(title) > 200 or not isinstance(description, str) or len(description) > 10000:
                    self.send_error_json(400, "A title (up to 200 characters) and description (up to 10000 characters) are required")
                    return
                updated = database.update_media_details(int(media_match.group(1)), title, description)
                if not updated:
                    self.send_error_json(404, "Media not found")
                    return
                database.log_activity("update_media", "PATCH", path, 200, self.client_address[0], input_data={"media_id": updated["id"], "title": updated["title"]})
                self.send_json(200, updated)
            except (ValueError, TypeError) as error:
                self.send_error_json(400, "Invalid metadata")
            return
        self.send_error_json(404, f"Endpoint {path} not found")

    def do_DELETE(self):
        self.close_connection = True
        if self.handle_auth():
            return
        if not self.guard_api_write():
            return

        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if share_access.handle_owner(self,path):return
        if self.handle_folder_write(path):
            return

        poem_match = re.match(r"^/api/poems/(\d+)$", path)
        if poem_match:
            if not self.require_auth():
                return
            poem_id = int(poem_match.group(1))
            if database.delete_poem(poem_id):
                database.log_activity("delete_poem", "DELETE", path, 200, self.client_address[0], input_data={"poem_id": poem_id})
                self.send_json(200, {"success": True, "message": f"Poem {poem_id} deleted"})
            else:
                self.send_error_json(404, "Poem not found")
            return

        # Deletion with Safe Recovery State Machine
        media_match = re.match(r"^/api/media/(\d+)$", path)
        if media_match:
            if not self.require_auth():
                return
            media_id = int(media_match.group(1))
            
            # Step 1: Mark pending_delete (Immediately hides item from visitors)
            marked_item = database.mark_media_pending_delete(media_id)
            if not marked_item:
                self.send_error_json(404, "Media not found")
                return

            database.revoke_media_share(media_id)
            try:
                media_storage.remove_files(marked_item,UPLOADS_DIR)
            except (OSError,ValueError) as error:
                database.log_activity('delete_media_failed','DELETE',path,500,self.client_address[0],input_data={'media_id':media_id},error_message=str(error))
                self.send_error_json(500,'File cleanup is pending and will be retried. The file and its shares are already inaccessible.')
                return
            deleted_record=database.delete_media_final(media_id)
            database.log_activity("delete_media", "DELETE", path, 200, self.client_address[0], input_data={"media_id": media_id}, output_data=deleted_record)
            self.send_json(200, {"success": True, "message": f"Media {media_id} permanently deleted", "item": deleted_record})
            return

        self.send_error_json(404, f"Endpoint {path} not found")

    @storage_guard.admit_upload
    def handle_raw_stream_upload(self, query: dict):
        tmp_path = None
        save_path = None
        technical = {}
        try:
            cl_header = self.headers.get("Content-Length")
            if not cl_header:
                self.close_connection = True
                self.send_error_json(411, "Length Required: Content-Length header is missing")
                return

            content_length = int(cl_header)
            if content_length <= 0:
                self.send_error_json(400, "Empty payload")
                return

            folder_id = int(query['folder_id'][0]) if query.get('folder_id', [''])[0] else None
            with database.get_db() as conn:
                database.validate_folder(conn, folder_id)
            original_filename = query.get("filename", ["asset.dat"])[0]
            ext = os.path.splitext(original_filename)[1].lower()

            if ext not in ALLOWED_EXTS:
                self.close_connection = True
                self.send_error_json(400, f"Unsupported file format '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTS))}")
                return

            is_video = ext in ALLOWED_VIDEO_EXTS
            media_type = "video" if is_video else "image"
            max_limit = MAX_VIDEO_SIZE if is_video else MAX_IMAGE_SIZE

            if content_length > max_limit:
                self.close_connection = True
                self.send_error_json(413, f"File exceeds maximum allowed size of {max_limit // (1024*1024)}MB")
                return

            title = query.get("title", ["Untitled Project"])[0]
            desc = query.get("description", [""])[0]

            subfolder = "videos" if is_video else "images"
            target_dir = UPLOADS_DIR / subfolder
            target_dir.mkdir(parents=True, exist_ok=True)

            anonymous_filename = f"{secrets.token_hex(16)}{ext}"
            save_path = target_dir / anonymous_filename

            with tempfile.NamedTemporaryFile(dir=TMP_DIR, delete=False) as tmp:
                tmp_path = Path(tmp.name)
                bytes_read = 0
                while bytes_read < content_length:
                    chunk = self.rfile.read(min(CHUNK_SIZE, content_length - bytes_read))
                    if not chunk:
                        self.close_connection = True
                        raise ConnectionResetError(f"Upload interrupted: expected {content_length} bytes, received {bytes_read}")
                    tmp.write(chunk)
                    bytes_read += len(chunk)

            # Structural validation & metadata sanitization
            if media_type == "image":
                try:
                    final_size, width, height = validate_and_sanitize_image(tmp_path, save_path, ext)
                except ValueError as err:
                    self.send_error_json(400, f"Invalid image file: {str(err)}")
                    return
                finally:
                    if tmp_path and tmp_path.is_file():
                        tmp_path.unlink()
                        tmp_path = None
            else:
                try:
                    validate_video_file(tmp_path, ext, technical)
                except ValueError as err:
                    self.send_error_json(400, f"Invalid video file: {str(err)}")
                    return
                tmp_path.replace(save_path)
                tmp_path = None
                final_size = save_path.stat().st_size

            mime_type, _ = mimetypes.guess_type(str(save_path))
            if not mime_type:
                mime_type = "video/mp4" if is_video else "image/jpeg"

            if is_video and os.environ.get("GENERATE_HLS") == "1":
                hls_dir = VIDEOS_DIR / Path(anonymous_filename).stem
                hls_info = transcode_video_to_hls(save_path, hls_dir)
                if hls_info:
                    rel_url, final_size = hls_info
                    mime_type = "application/vnd.apple.mpegurl"
                else:
                    rel_url = f"/uploads/{subfolder}/{anonymous_filename}"
            else:
                rel_url = f"/uploads/{subfolder}/{anonymous_filename}"

            try:
                record = database.create_media(
                    title=title,
                    description=desc,
                    media_type=media_type,
                    filename=anonymous_filename,
                    relative_url=rel_url,
                    file_size=final_size,
                    mime_type=mime_type,
                    original_filename=original_filename,
                    folder_id=folder_id
                )
            except Exception as db_err:
                if save_path and save_path.is_file():
                    save_path.unlink()
                raise db_err

            if not technical and media_type=='image':technical={'width':width,'height':height}
            database.save_media_metadata(record['id'],technical)
            record.update(technical)
            try:
                self.send_json(201, record)
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass

        except ConnectionResetError as conn_err:
            self.send_error_json(400, str(conn_err))
        except ValueError as error:
            self.send_error_json(400,str(error))
        except Exception:
            self.send_error_json(500,"Upload could not be completed")
        finally:
            if tmp_path and tmp_path.is_file():
                try:
                    tmp_path.unlink()
                except OSError:
                    pass

    @storage_guard.admit_upload
    def handle_multipart_upload(self):
        tmp_path = None
        save_path = None
        technical = {}
        try:
            cl_header = self.headers.get("Content-Length")
            if not cl_header:
                self.close_connection = True
                self.send_error_json(411, "Length Required: Content-Length header is missing")
                return

            content_length = int(cl_header)
            if content_length <= 0:
                self.send_error_json(400, "Empty payload")
                return
            if content_length > MAX_GLOBAL_UPLOAD:
                self.close_connection = True
                self.send_error_json(413, f"Payload exceeds maximum allowed size of {MAX_GLOBAL_UPLOAD // (1024*1024)}MB")
                return

            with tempfile.NamedTemporaryFile(dir=TMP_DIR, delete=False) as tmp:
                tmp_path = Path(tmp.name)
                fields, original_filename = parse_upload(
                    self.rfile, self.headers.get("Content-Type", ""), content_length, tmp,
                    video_exts=ALLOWED_VIDEO_EXTS, image_exts=ALLOWED_IMAGE_EXTS,
                    video_limit=MAX_VIDEO_SIZE, image_limit=MAX_IMAGE_SIZE,
                    field_limit=MAX_FIELD_LEN, header_limit=MAX_PART_HEADER_LEN,
                    part_limit=MAX_PARTS, chunk_size=CHUNK_SIZE,
                )

            folder_id = int(fields['folder_id']) if fields.get('folder_id') else None
            with database.get_db() as conn:
                database.validate_folder(conn, folder_id)
            ext = os.path.splitext(original_filename)[1].lower()
            if ext not in ALLOWED_EXTS:
                self.send_error_json(400, f"Unsupported file format '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTS))}")
                return

            is_video = ext in ALLOWED_VIDEO_EXTS
            media_type = "video" if is_video else "image"
            max_limit = MAX_VIDEO_SIZE if is_video else MAX_IMAGE_SIZE

            file_size = tmp_path.stat().st_size
            if file_size > max_limit:
                self.send_error_json(413, f"File exceeds maximum allowed size of {max_limit // (1024*1024)}MB")
                return

            subfolder = "videos" if is_video else "images"
            target_dir = UPLOADS_DIR / subfolder
            target_dir.mkdir(parents=True, exist_ok=True)

            anonymous_filename = f"{secrets.token_hex(16)}{ext}"
            save_path = target_dir / anonymous_filename

            # Structural validation & metadata sanitization
            if media_type == "image":
                try:
                    final_size, width, height = validate_and_sanitize_image(tmp_path, save_path, ext)
                except ValueError as err:
                    self.send_error_json(400, f"Invalid image file: {str(err)}")
                    return
                finally:
                    if tmp_path and tmp_path.is_file():
                        tmp_path.unlink()
                        tmp_path = None
            else:
                try:
                    validate_video_file(tmp_path, ext, technical)
                except ValueError as err:
                    self.send_error_json(400, f"Invalid video file: {str(err)}")
                    return
                tmp_path.replace(save_path)
                tmp_path = None
                final_size = save_path.stat().st_size

            mime_type, _ = mimetypes.guess_type(str(save_path))
            if not mime_type:
                mime_type = "video/mp4" if is_video else "image/jpeg"

            title = fields.get("title") or "Untitled Project"
            desc = fields.get("description", "")

            if is_video and os.environ.get("GENERATE_HLS") == "1":
                hls_dir = VIDEOS_DIR / Path(anonymous_filename).stem
                hls_info = transcode_video_to_hls(save_path, hls_dir)
                if hls_info:
                    rel_url, final_size = hls_info
                    mime_type = "application/vnd.apple.mpegurl"
                else:
                    rel_url = f"/uploads/{subfolder}/{anonymous_filename}"
            else:
                rel_url = f"/uploads/{subfolder}/{anonymous_filename}"

            try:
                record = database.create_media(
                    title=title,
                    description=desc,
                    media_type=media_type,
                    filename=anonymous_filename,
                    relative_url=rel_url,
                    file_size=final_size,
                    mime_type=mime_type,
                    original_filename=original_filename,
                    folder_id=folder_id
                )
            except Exception as db_err:
                if save_path and save_path.is_file():
                    save_path.unlink()
                raise db_err

            if not technical and media_type=='image':
                technical={'width':width,'height':height}
            database.save_media_metadata(record['id'],technical)
            record.update(technical)
            try:
                database.log_activity(
                    "upload_media", "POST", "/api/upload", 201, self.client_address[0],
                    input_data={"title": title, "filename": original_filename, "size": final_size, "type": media_type},
                    output_data={"id": record.get("id"), "url": rel_url}
                )
                self.send_json(201, record)
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass

        except ConnectionResetError as conn_err:
            database.log_activity("upload_failed", "POST", "/api/upload", 400, self.client_address[0], error_message=str(conn_err))
            self.close_connection = True
            self.send_error_json(400, str(conn_err))
        except ValueError as val_err:
            database.log_activity("upload_failed", "POST", "/api/upload", 400, self.client_address[0], error_message=str(val_err))
            self.close_connection = True
            self.send_error_json(400, str(val_err))
        except Exception as e:
            database.log_activity("upload_failed", "POST", "/api/upload", 500, self.client_address[0], error_message=str(e))
            self.send_error_json(500, f"Upload failed: {str(e)}")
        finally:
            if tmp_path and tmp_path.is_file():
                try:
                    tmp_path.unlink()
                except OSError:
                    pass


def run_server(port: int = 8000, host: str = "127.0.0.1"):
    database.init_db()
    auth.init_auth()
    # Startup persistence recovery
    cleaned_tmp = cleanup_orphaned_tmp_files(TMP_DIR)
    cleaned_del = database.cleanup_unfinished_deletions(UPLOADS_DIR)
    if cleaned_tmp > 0 or cleaned_del > 0:
        print(f"🧹 Startup cleanup: removed {cleaned_tmp} stale temp files, {cleaned_del} pending deletions")

    server_address = (host, port)
    httpd = ThreadingHTTPServer(server_address, PortfolioHandler)
    print("=" * 60)
    print(f"🎬 Creative Portfolio Backend running on http://localhost:{port}")
    print(f"🔒 Cookie-only Authentication: Powered by auth.AuthMixin")
    print(f"🛡️  Hardened: Path traversal, RFC 9110 ranges, Pillow/Mutagen validation active")
    print("=" * 60)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server gracefully...")
        httpd.shutdown()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    run_server(port=port)

