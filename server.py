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
import secrets
import subprocess
import math
import tempfile
import shutil
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional, Tuple, Dict, Any

from PIL import Image, ImageOps, UnidentifiedImageError
from upload_parser import parse_upload

import database

# Configure Pillow limits to protect against decompression bombs
Image.MAX_IMAGE_PIXELS = 50_000_000

BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
VIDEOS_DIR = UPLOADS_DIR / "videos"
IMAGES_DIR = UPLOADS_DIR / "images"
STATIC_DIR = BASE_DIR / "static"
TMP_DIR = BASE_DIR / ".tmp_uploads"

for d in (UPLOADS_DIR, VIDEOS_DIR, IMAGES_DIR, STATIC_DIR, TMP_DIR):
    d.mkdir(parents=True, exist_ok=True)

mimetypes.add_type("application/vnd.apple.mpegurl", ".m3u8")
mimetypes.add_type("video/mp2t", ".ts")

TOKEN_FILE = BASE_DIR / ".admin_token"
_ENV_TOKEN = os.environ.get("PORTFOLIO_ADMIN_TOKEN")

if _ENV_TOKEN:
    ADMIN_TOKEN = _ENV_TOKEN
elif TOKEN_FILE.is_file():
    ADMIN_TOKEN = TOKEN_FILE.read_text().strip()
else:
    ADMIN_TOKEN = secrets.token_hex(24)
    try:
        TOKEN_FILE.write_text(ADMIN_TOKEN)
        TOKEN_FILE.chmod(0o600)
    except OSError:
        pass

ALLOWED_VIDEO_EXTS = {".mp4", ".webm", ".mov"}
ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_EXTS = ALLOWED_VIDEO_EXTS | ALLOWED_IMAGE_EXTS

MAX_VIDEO_SIZE = 50 * 1024 * 1024       # 50 MB
MAX_IMAGE_SIZE = 10 * 1024 * 1024       # 10 MB
MAX_GLOBAL_UPLOAD = 60 * 1024 * 1024    # 60 MB
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
    """
    Decodes image through Pillow, verifies pixel decoding integrity, normalizes EXIF orientation,
    removes private/GPS/camera metadata, enforces dimension limits (<= 8192px),
    and saves clean output.
    Returns: (final_file_size, width, height)
    """
    ext = ext.lower()
    fmt_map = {'.jpg': 'JPEG', '.jpeg': 'JPEG', '.png': 'PNG', '.webp': 'WEBP'}
    fmt = fmt_map.get(ext)
    if not fmt:
        raise ValueError(f"Unsupported image format: {ext}")

    # 1. Structural verify pass
    try:
        with Image.open(input_path) as img:
            img.verify()
    except Exception as e:
        raise ValueError(f"Corrupt or non-decodable image: {str(e)}")

    # 2. Re-open to load image data, apply orientation, check dimensions, and strip metadata
    try:
        with Image.open(input_path) as img:
            w, h = img.size
            if w > 8192 or h > 8192:
                raise ValueError(f"Image dimensions ({w}x{h}) exceed maximum allowed (8192x8192)")
            
            # Normalize orientation (transposes pixels so image remains upright after EXIF removal)
            img = ImageOps.exif_transpose(img)
            
            # Save clean image without EXIF / GPS / IPTC metadata
            if fmt == 'JPEG':
                if img.mode not in ('RGB', 'L'):
                    img = img.convert('RGB')
                img.save(output_path, format='JPEG', quality=95, optimize=True)
            elif fmt == 'PNG':
                img.save(output_path, format='PNG', optimize=True)
            elif fmt == 'WEBP':
                img.save(output_path, format='WEBP', quality=95)
            
            final_size = output_path.stat().st_size
            return final_size, img.width, img.height
    except Exception as e:
        raise ValueError(f"Image processing failed: {str(e)}")


def validate_video_file(file_path: Path, ext: str) -> float:
    """Inspect real video tracks with FFprobe; this does not decode every frame."""
    if ext.lower() not in ALLOWED_VIDEO_EXTS:
        raise ValueError("Unsupported video format")
    command = ["ffprobe", "-v", "error", "-protocol_whitelist", "file",
               "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,width,height,duration",
               "-of", "json", str(file_path)]
    try:
        result = subprocess.run(command, capture_output=True, timeout=15, check=False)
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

        # Attempt 1: Fast stream copy (instant, lossless)
        cmd_copy = [
            "ffmpeg", "-y", "-i", str(input_path),
            "-codec:", "copy",
            "-start_number", "0",
            "-hls_time", "3",
            "-hls_list_size", "0",
            "-f", "hls",
            str(playlist)
        ]
        res_copy = subprocess.run(cmd_copy, capture_output=True, timeout=60, check=False)

        # If copy fails or stream isn't playable across all browsers, transcode to standard h264/aac
        if res_copy.returncode != 0 or not playlist.is_file():
            cmd_transcode = [
                "ffmpeg", "-y", "-i", str(input_path),
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                "-c:a", "aac", "-b:a", "128k",
                "-start_number", "0",
                "-hls_time", "3",
                "-hls_list_size", "0",
                "-f", "hls",
                str(playlist)
            ]
            res_trans = subprocess.run(cmd_transcode, capture_output=True, timeout=180, check=False)
            if res_trans.returncode != 0 or not playlist.is_file():
                return None

        total_bytes = sum(f.stat().st_size for f in hls_dir.iterdir() if f.is_file())
        rel_url = f"/uploads/videos/{hls_dir.name}/index.m3u8"
        return rel_url, total_bytes
    except Exception:
        return None


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


class PortfolioHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def setup(self):
        super().setup()
        self.connection.settimeout(30.0)

    def log_message(self, format, *args):
        clean_path = urllib.parse.urlparse(self.path).path
        sys.stdout.write(f"[{self.log_date_time_string()}] {self.command} {clean_path} -> {args[1] if len(args) > 1 else ''}\n")
        sys.stdout.flush()

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, Range, X-Admin-Token")
        self.send_header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'none'; connect-src 'self'; media-src 'self' blob: https://assets.21st.dev; worker-src 'self' blob:; img-src 'self' data: https://assets.21st.dev; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self' data:")
        if self.close_connection:
            self.send_header("Connection", "close")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def is_authenticated(self) -> bool:
        token = self.headers.get("X-Admin-Token")
        if not token:
            auth_header = self.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:].strip()
        return bool(token and secrets.compare_digest(token, ADMIN_TOKEN))

    def require_auth(self) -> bool:
        if not self.is_authenticated():
            self.send_error_json(401, "Unauthorized: Provide valid X-Admin-Token or Authorization Bearer header")
            return False
        return True

    def send_json(self, status_code: int, data: any):
        payload = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
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

    def serve_file_with_range(self, filepath: Path, head_only: bool = False):
        total_size = filepath.stat().st_size
        ext = filepath.suffix.lower()
        if ext == ".ts":
            mime_type = "video/mp2t"
        elif ext == ".m3u8":
            mime_type = "application/vnd.apple.mpegurl"
        else:
            mime_type, _ = mimetypes.guess_type(str(filepath))
            if not mime_type:
                mime_type = "application/octet-stream"
        if ext in {".html", ".htm"}:
            cache_header = "no-cache, no-store, must-revalidate"
        elif ext in {".css", ".js"}:
            cache_header = "no-cache, must-revalidate"
        else:
            cache_header = "public, max-age=86400"

        range_header = self.headers.get("Range")

        try:
            if range_header:
                parsed_range = parse_byte_range(range_header, total_size)
                if parsed_range is None:
                    self.send_response(416)
                    self.send_cors_headers()
                    self.send_header("Content-Range", f"bytes */{total_size}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return

                start, end = parsed_range
                content_length = end - start + 1

                self.send_response(206)
                self.send_cors_headers()
                self.send_header("Content-Type", mime_type)
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Range", f"bytes {start}-{end}/{total_size}")
                self.send_header("Content-Length", str(content_length))
                self.send_header("Content-Disposition", "inline")
                self.send_header("Cache-Control", cache_header)
                self.end_headers()

                if not head_only:
                    with open(filepath, "rb") as f:
                        f.seek(start)
                        bytes_remaining = content_length
                        while bytes_remaining > 0:
                            chunk = f.read(min(CHUNK_SIZE, bytes_remaining))
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                            bytes_remaining -= len(chunk)

            else:
                self.send_response(200)
                self.send_cors_headers()
                self.send_header("Content-Type", mime_type)
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Length", str(total_size))
                self.send_header("Content-Disposition", "inline")
                self.send_header("Cache-Control", cache_header)
                self.end_headers()

                if not head_only:
                    with open(filepath, "rb") as f:
                        while True:
                            chunk = f.read(CHUNK_SIZE)
                            if not chunk:
                                break
                            self.wfile.write(chunk)

        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_HEAD(self):
        self.do_GET(head_only=True)

    def do_GET(self, head_only: bool = False):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/api/health":
            self.send_json(200, {"status": "ok", "service": "Portfolio Creative Backend", "version": "2.0.0"})
            return

        if path == "/api/stats":
            self.send_json(200, database.get_stats())
            return

        if path == "/api/auth/verify":
            self.send_json(200, {"authenticated": self.is_authenticated()})
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
            items = database.get_all_media(media_type=media_type)
            self.send_json(200, {"count": len(items), "media": items})
            return

        media_match = re.match(r"^/api/media/(\d+)$", path)
        if media_match:
            media_id = int(media_match.group(1))
            media_item = database.get_media_by_id(media_id)
            if media_item:
                self.send_json(200, media_item)
            else:
                self.send_error_json(404, "Media not found")
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

        if path == "/" or path == "/dashboard":
            safe_index = resolve_safe_path(STATIC_DIR, "index.html")
            if safe_index:
                self.serve_file_with_range(safe_index, head_only=head_only)
                return

        if path.startswith("/static/"):
            rel_path = path[len("/static/"):].lstrip("/")
            safe_target = resolve_safe_path(STATIC_DIR, rel_path)
            if safe_target:
                self.serve_file_with_range(safe_target, head_only=head_only)
                return
            else:
                self.send_error_json(404, "Static asset not found")
                return

        self.send_error_json(404, f"Endpoint {path} not found")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

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
                created = database.create_poem(title, content, mood, tags)
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
                    self.send_json(200, updated)
                else:
                    self.send_error_json(404, "Poem not found")
            except Exception as e:
                self.send_error_json(400, f"Invalid request: {str(e)}")
            return

        self.send_error_json(404, f"Endpoint {path} not found")

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        poem_match = re.match(r"^/api/poems/(\d+)$", path)
        if poem_match:
            if not self.require_auth():
                return
            poem_id = int(poem_match.group(1))
            if database.delete_poem(poem_id):
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

            # Step 2: Unlink physical file or HLS directory
            rel_url = marked_item.get("relative_url", "")
            if rel_url.startswith("/uploads/"):
                rel_disk_path = rel_url[len("/uploads/"):].lstrip("/")
                safe_target = resolve_safe_path(UPLOADS_DIR, rel_disk_path)
                if safe_target:
                    try:
                        if safe_target.name == "index.m3u8" and safe_target.parent.is_relative_to(VIDEOS_DIR):
                            safe_target.unlink()
                            shutil.rmtree(safe_target.parent, ignore_errors=True)
                            filename = marked_item.get("filename", "")
                            if filename:
                                orig_file = resolve_safe_path(VIDEOS_DIR, filename)
                                if orig_file and orig_file.is_file():
                                    orig_file.unlink()
                        elif safe_target.is_file():
                            safe_target.unlink()
                    except OSError as e:
                        # Unlink failed: item remains marked pending_delete (visitors cannot see it),
                        # but API returns 500 indicating unlinking retry needed
                        self.send_error_json(500, f"Disk unlinking failed: {str(e)}. Item marked for deletion retry.")
                        return

            # Step 3: File successfully unlinked -> permanently purge database row
            deleted_record = database.delete_media_final(media_id)
            self.send_json(200, {"success": True, "message": f"Media {media_id} permanently deleted", "item": deleted_record})
            return

        self.send_error_json(404, f"Endpoint {path} not found")

    def handle_raw_stream_upload(self, query: dict):
        tmp_path = None
        save_path = None
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

            title = query.get("title", [os.path.splitext(original_filename)[0]])[0]
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
                    final_size, _, _ = validate_and_sanitize_image(tmp_path, save_path, ext)
                except ValueError as err:
                    self.send_error_json(400, f"Invalid image file: {str(err)}")
                    return
                finally:
                    if tmp_path and tmp_path.is_file():
                        tmp_path.unlink()
                        tmp_path = None
            else:
                try:
                    validate_video_file(tmp_path, ext)
                except ValueError as err:
                    self.send_error_json(400, f"Invalid video file: {str(err)}")
                    return
                tmp_path.replace(save_path)
                tmp_path = None
                final_size = save_path.stat().st_size

            mime_type, _ = mimetypes.guess_type(str(save_path))
            if not mime_type:
                mime_type = "video/mp4" if is_video else "image/jpeg"

            if is_video:
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
                    mime_type=mime_type
                )
            except Exception as db_err:
                if save_path and save_path.is_file():
                    save_path.unlink()
                raise db_err

            try:
                self.send_json(201, record)
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass

        except ConnectionResetError as conn_err:
            self.send_error_json(400, str(conn_err))
        except Exception as e:
            self.send_error_json(500, f"Upload error: {str(e)}")
        finally:
            if tmp_path and tmp_path.is_file():
                try:
                    tmp_path.unlink()
                except OSError:
                    pass

    def handle_multipart_upload(self):
        tmp_path = None
        save_path = None
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
                    final_size, _, _ = validate_and_sanitize_image(tmp_path, save_path, ext)
                except ValueError as err:
                    self.send_error_json(400, f"Invalid image file: {str(err)}")
                    return
                finally:
                    if tmp_path and tmp_path.is_file():
                        tmp_path.unlink()
                        tmp_path = None
            else:
                try:
                    validate_video_file(tmp_path, ext)
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

            if is_video:
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
                    mime_type=mime_type
                )
            except Exception as db_err:
                if save_path and save_path.is_file():
                    save_path.unlink()
                raise db_err

            try:
                self.send_json(201, record)
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass

        except ConnectionResetError as conn_err:
            self.close_connection = True
            self.send_error_json(400, str(conn_err))
        except ValueError as val_err:
            self.close_connection = True
            self.send_error_json(400, str(val_err))
        except Exception as e:
            self.send_error_json(500, f"Upload failed: {str(e)}")
        finally:
            if tmp_path and tmp_path.is_file():
                try:
                    tmp_path.unlink()
                except OSError:
                    pass


def run_server(port: int = 8000, host: str = "0.0.0.0"):
    database.init_db()
    # Startup persistence recovery
    cleaned_tmp = cleanup_orphaned_tmp_files(TMP_DIR)
    cleaned_del = database.cleanup_unfinished_deletions(UPLOADS_DIR)
    if cleaned_tmp > 0 or cleaned_del > 0:
        print(f"🧹 Startup cleanup: removed {cleaned_tmp} stale temp files and {cleaned_del} pending deletions")

    server_address = (host, port)
    httpd = ThreadingHTTPServer(server_address, PortfolioHandler)
    print("=" * 60)
    print(f"🎬 Creative Portfolio Backend running on http://localhost:{port}")
    print(f"🔒 Admin Key Protected: Token configured from environment / .admin_token")
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

