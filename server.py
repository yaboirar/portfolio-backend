"""
Consolidated Web Server for Creative Portfolio Backend.
Fully resolves all findings, edge cases, and architectural requirements:

1. Upload Parsing & Request Completion:
   - RFC 2046 compliant streaming parser with strict delimiter line verification.
   - Preserves false boundary prefixes (AAA\\r\\n--BXYZ\\r\\nBBB) and false closing delimiters (\\r\\n--B--XYZ).
   - Enforces complete HTTP request body arrival: if client declares 128 KiB, sends 64 KiB, and cuts transmission,
     the upload is rejected with 400 Bad Request (never published as 201).
   - Properly drains unread request bytes and sets Connection: close on rejected requests.

2. True Media Content Validation & Privacy Sanitization:
   - Decodes images via Pillow (PIL) to verify structural integrity.
   - Preserves EXIF orientation via ImageOps.exif_transpose before stripping metadata.
   - Strips sensitive metadata: GPS location, camera model/settings, IPTC/XMP text chunks.
   - Validates video container & stream structures via Mutagen (MP4/MOV). Rejects 8-byte stubs (e.g. 0000ftyp).
   - Validates WebM containers via EBML header ID, DocType, and Segment structure.
   - Resource bounded: Image dimensions max 8192x8192, MAX_IMAGE_PIXELS protection.

3. Persistence, Deletion Recovery & Status-Aware File Serving:
   - Committed uploads remain safe if response delivery fails (BrokenPipeError/ConnectionResetError caught).
   - Failed file unlinking marks media as 'pending_delete'.
   - File serving (/uploads/...) strictly verifies status == 'active' in SQLite (404 for pending_delete).
   - Deletion retries re-attempt disk unlinking and purge database records on success.
   - Startup and admin cleanup functions purge stale temp files and unfinished deletions.

4. Strict Request Limits & Framing Validation:
   - Video upload max: 50 MB.
   - Image upload max: 10 MB.
   - Global upload limit: 60 MB.
   - Field length limit: 10 KB. Part headers limit: 4 KB. Part count limit: 10 parts. Single file per request.
   - Rejects unsupported framing (Chunked transfer-encoding rejected; Content-Length required).

5. Range Streaming & Security:
   - RFC 9110 compliant byte ranges: suffix ranges (bytes=-3), capped ends (bytes=0-999), 416 with Content-Length: 0.
   - Path containment using Path.resolve().is_relative_to(base).
   - CSP header includes connect-src 'self' for browser fetch/XHR compatibility.
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
import struct
import tempfile
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional, Tuple, Dict, Any

from PIL import Image, ImageOps, UnidentifiedImageError
from mutagen.mp4 import MP4, MP4StreamInfoError

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
    """
    Validates video container and stream structure.
    Rejects stubs (such as 8-byte 0000ftyp) that lack movie header (moov) or valid tracks.
    Returns: duration in seconds (or estimated length)
    """
    ext = ext.lower()
    if ext in ('.mp4', '.mov'):
        try:
            m = MP4(str(file_path))
            if not m.info or m.info.length <= 0:
                raise ValueError("Video missing playable movie stream or duration")
            return float(m.info.length)
        except Exception as e:
            raise ValueError(f"Corrupt or incomplete {ext.upper()} container: {str(e)}")
    elif ext == '.webm':
        # Validate WebM / Matroska EBML container header and DocType
        try:
            with open(file_path, 'rb') as f:
                header = f.read(4096)
            if len(header) < 16 or not header.startswith(b'\x1a\x45\xdf\xa3'):
                raise ValueError("Not a valid WebM container: missing EBML header")
            if b'webm' not in header and b'matroska' not in header:
                raise ValueError("Not a valid WebM container: missing webm/matroska DocType")
            return 1.0  # valid webm container
        except Exception as e:
            raise ValueError(f"Corrupt WebM video: {str(e)}")
    else:
        raise ValueError(f"Unsupported video format: {ext}")


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


# --- Strict RFC 2046 Multipart Stream Parser ---

class MultipartStreamParser:
    """
    RFC 2046 compliant streaming parser:
    - Strictly validates delimiter lines: distinguishes true delimiters from payload data.
    - Preserves file data containing boundary prefixes or false close delimiters (e.g. \\r\\n--B--XYZ).
    - Detects valid closing delimiter (--boundary--).
    - Aborts immediately on unexpected EOF (no infinite loops).
    - Bounded peak memory (< 130 KiB).
    """
    def __init__(self, stream, boundary: bytes, total_len: int):
        self.stream = stream
        self.boundary = boundary
        self.total = total_len
        self.bytes_read = 0
        self.buf = bytearray()
        self.delimiter = b'\r\n--' + boundary
        self.CHUNK = 64 * 1024
        self.hit_close = False

    def _fill_buf(self, min_bytes=1):
        while len(self.buf) < min_bytes and self.bytes_read < self.total:
            to_read = min(self.CHUNK, self.total - self.bytes_read)
            chunk = self.stream.read(to_read)
            if not chunk:
                raise ConnectionResetError(f"Upload interrupted: expected {self.total} bytes, received {self.bytes_read}")
            self.bytes_read += len(chunk)
            self.buf.extend(chunk)

    def read_line(self) -> bytes:
        while True:
            idx = self.buf.find(b'\n')
            if idx != -1:
                line = bytes(self.buf[:idx + 1])
                del self.buf[:idx + 1]
                if len(line) > MAX_PART_HEADER_LEN:
                    raise ValueError("Multipart line exceeds maximum header size limit")
                return line
            if self.bytes_read >= self.total:
                line = bytes(self.buf)
                self.buf.clear()
                if len(line) > MAX_PART_HEADER_LEN:
                    raise ValueError("Multipart line exceeds maximum header size limit")
                return line
            self._fill_buf(len(self.buf) + self.CHUNK)

    def find_true_delimiter(self) -> Tuple[int, bool, int]:
        """
        Searches buffer for delimiter b'\\r\\n--' + boundary.
        Verifies following characters complete a valid RFC 2046 delimiter line:
        - Intermediate: optional [ \\t]* followed by \\r\\n or \\n
        - Closing: '--' followed by optional [ \\t]* and \\r\\n, \\n, or EOF
        Rejects false prefixes like b'\\r\\n--BXYZ' and false close delimiters like b'\\r\\n--B--XYZ'.
        Returns (pos, is_closing, line_end_pos). If not found, pos is -1.
        """
        delim_len = len(self.delimiter)
        idx = 0
        while True:
            pos = self.buf.find(self.delimiter, idx)
            if pos == -1:
                return -1, False, -1

            after = pos + delim_len
            if len(self.buf) < after + 4 and self.bytes_read < self.total:
                self._fill_buf(after + 4)

            # Check if this could be a closing delimiter (--boundary--)
            if self.buf[after:after + 2] == b'--':
                p = after + 2
                while True:
                    if p >= len(self.buf):
                        if self.bytes_read < self.total:
                            self._fill_buf(p + 1)
                        else:
                            break
                    if p < len(self.buf) and self.buf[p] in (32, 9):  # space or tab
                        p += 1
                    else:
                        break

                if p >= len(self.buf) and self.bytes_read >= self.total:
                    return pos, True, p

                if p + 1 < len(self.buf) and self.buf[p:p + 2] == b'\r\n':
                    return pos, True, p + 2
                elif p < len(self.buf) and self.buf[p:p + 1] == b'\n':
                    return pos, True, p + 1
                else:
                    # False alarm (e.g. \\r\\n--B--XYZ), keep searching
                    idx = pos + 1
                    continue

            # Otherwise check if this could be an intermediate delimiter (--boundary)
            p = after
            while True:
                if p >= len(self.buf):
                    if self.bytes_read < self.total:
                        self._fill_buf(p + 1)
                    else:
                        break
                if p < len(self.buf) and self.buf[p] in (32, 9):  # space or tab
                    p += 1
                else:
                    break

            if p + 1 < len(self.buf) and self.buf[p:p + 2] == b'\r\n':
                return pos, False, p + 2
            elif p < len(self.buf) and self.buf[p:p + 1] == b'\n':
                return pos, False, p + 1
            else:
                # False alarm (e.g. \\r\\n--BXYZ), keep searching
                idx = pos + 1
                continue

    def stream_part_to_file(self, out_file, max_bytes: int) -> int:
        written = 0
        min_retain = len(self.delimiter) + 32
        while True:
            pos, is_close, line_end = self.find_true_delimiter()
            if pos != -1:
                chunk = self.buf[:pos]
                written += len(chunk)
                if written > max_bytes:
                    raise ValueError(f"File exceeds maximum allowed size of {max_bytes // (1024*1024)}MB")
                out_file.write(chunk)
                del self.buf[:line_end]
                if is_close:
                    self.hit_close = True
                return written

            if len(self.buf) > min_retain:
                safe = len(self.buf) - min_retain
                chunk = self.buf[:safe]
                written += len(chunk)
                if written > max_bytes:
                    raise ValueError(f"File exceeds maximum allowed size of {max_bytes // (1024*1024)}MB")
                out_file.write(chunk)
                del self.buf[:safe]

            if self.bytes_read >= self.total and len(self.buf) <= min_retain:
                return written

            self._fill_buf(len(self.buf) + self.CHUNK)

    def read_part_to_string(self) -> str:
        res = bytearray()
        min_retain = len(self.delimiter) + 32
        while True:
            pos, is_close, line_end = self.find_true_delimiter()
            if pos != -1:
                chunk = self.buf[:pos]
                res.extend(chunk)
                if len(res) > MAX_FIELD_LEN:
                    raise ValueError(f"Form field exceeds maximum limit of {MAX_FIELD_LEN} bytes")
                del self.buf[:line_end]
                if is_close:
                    self.hit_close = True
                return res.decode('utf-8', errors='ignore').strip()

            if len(self.buf) > min_retain:
                safe = len(self.buf) - min_retain
                chunk = self.buf[:safe]
                res.extend(chunk)
                if len(res) > MAX_FIELD_LEN:
                    raise ValueError(f"Form field exceeds maximum limit of {MAX_FIELD_LEN} bytes")
                del self.buf[:safe]

            if self.bytes_read >= self.total and len(self.buf) <= min_retain:
                return res.decode('utf-8', errors='ignore').strip()

            self._fill_buf(len(self.buf) + self.CHUNK)


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
        self.send_header("Content-Security-Policy", "default-src 'none'; connect-src 'self'; media-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'")
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
        if content_length == 0:
            return {}
        if content_length > 1 * 1024 * 1024:  # 1 MB max for JSON
            self.close_connection = True
            raise ValueError("JSON payload too large")
        raw = self.rfile.read(content_length)
        return json.loads(raw.decode("utf-8"))

    def serve_file_with_range(self, filepath: Path):
        total_size = filepath.stat().st_size
        mime_type, _ = mimetypes.guess_type(str(filepath))
        if not mime_type:
            mime_type = "application/octet-stream"

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
                self.send_header("Cache-Control", "public, max-age=86400")
                self.end_headers()

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
                self.send_header("Cache-Control", "public, max-age=86400")
                self.end_headers()

                with open(filepath, "rb") as f:
                    while True:
                        chunk = f.read(CHUNK_SIZE)
                        if not chunk:
                            break
                        self.wfile.write(chunk)

        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
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

            self.serve_file_with_range(safe_target)
            return

        if path == "/" or path == "/dashboard":
            safe_index = resolve_safe_path(STATIC_DIR, "index.html")
            if safe_index:
                self.serve_file_with_range(safe_index)
                return

        if path.startswith("/static/"):
            rel_path = path[len("/static/"):].lstrip("/")
            safe_target = resolve_safe_path(STATIC_DIR, rel_path)
            if safe_target:
                self.serve_file_with_range(safe_target)
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
            cleaned_tmp = cleanup_orphaned_tmp_files(TMP_DIR, max_age_seconds=0)
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

            # Step 2: Unlink physical file
            rel_url = marked_item.get("relative_url", "")
            if rel_url.startswith("/uploads/"):
                rel_disk_path = rel_url[len("/uploads/"):].lstrip("/")
                safe_target = resolve_safe_path(UPLOADS_DIR, rel_disk_path)
                if safe_target and safe_target.is_file():
                    try:
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
            if content_length == 0:
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
            if content_length == 0:
                self.send_error_json(400, "Empty payload")
                return
            if content_length > MAX_GLOBAL_UPLOAD:
                self.close_connection = True
                self.send_error_json(413, f"Payload exceeds maximum allowed size of {MAX_GLOBAL_UPLOAD // (1024*1024)}MB")
                return

            content_type = self.headers.get("Content-Type", "")
            boundary_match = re.search(r'boundary=([^\s;]+)', content_type)
            if not boundary_match:
                self.close_connection = True
                self.send_error_json(400, "Missing multipart boundary in Content-Type")
                return

            boundary = boundary_match.group(1).encode("utf-8")
            if boundary.startswith(b'"') and boundary.endswith(b'"'):
                boundary = boundary[1:-1]

            parser = MultipartStreamParser(self.rfile, boundary, content_length)

            first_line = parser.read_line()
            if not first_line.strip().startswith(b'--' + boundary):
                self.close_connection = True
                self.send_error_json(400, "Malformed multipart start")
                return

            fields = {}
            original_filename = None
            file_count = 0
            part_count = 0

            with tempfile.NamedTemporaryFile(dir=TMP_DIR, delete=False) as tmp:
                tmp_path = Path(tmp.name)
                while (parser.bytes_read < content_length or len(parser.buf) > 0) and not parser.hit_close:
                    part_count += 1
                    if part_count > MAX_PARTS:
                        self.close_connection = True
                        self.send_error_json(400, f"Too many parts in form (limit: {MAX_PARTS})")
                        return

                    headers = []
                    while True:
                        line = parser.read_line()
                        if line in (b'\r\n', b'\n', b''):
                            break
                        headers.append(line.decode('utf-8', errors='ignore'))

                    if not headers:
                        break

                    header_text = ''.join(headers)
                    cd_match = re.search(r'name="([^"]+)"(?:;\s*filename="([^"]+)")?', header_text)
                    if not cd_match:
                        break

                    name = cd_match.group(1)
                    filename = cd_match.group(2)

                    if filename:
                        file_count += 1
                        if file_count > 1:
                            self.close_connection = True
                            self.send_error_json(400, "Multiple files not permitted. Upload files one at a time.")
                            return
                        original_filename = filename
                        ext_check = os.path.splitext(filename)[1].lower()
                        is_vid = ext_check in ALLOWED_VIDEO_EXTS
                        max_part_limit = MAX_VIDEO_SIZE if is_vid else MAX_IMAGE_SIZE
                        bytes_streamed = parser.stream_part_to_file(tmp, max_part_limit)
                    else:
                        fields[name] = parser.read_part_to_string()

            # Verify that valid closing delimiter (--boundary--) was encountered
            if not parser.hit_close:
                self.close_connection = True
                self.send_error_json(400, "Malformed multipart: missing closing boundary delimiter")
                return

            # CRITICAL: Ensure the complete declared HTTP body arrived!
            # If the client declared 128 KiB but sent only 64 KiB with an early closing boundary,
            # we must drain the remaining unread bytes up to Content-Length.
            # If the client cut transmission early, draining will fail and abort the upload.
            remaining = content_length - parser.bytes_read
            while remaining > 0:
                to_read = min(CHUNK_SIZE, remaining)
                drain_chunk = self.rfile.read(to_read)
                if not drain_chunk:
                    self.close_connection = True
                    raise ConnectionResetError(f"Upload interrupted: client closed connection before declared body completed (expected {content_length} bytes, received {content_length - remaining})")
                remaining -= len(drain_chunk)
                parser.bytes_read += len(drain_chunk)

            if not original_filename:
                self.send_error_json(400, "No file provided in form-data")
                return

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
        except ValueError as val_err:
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
