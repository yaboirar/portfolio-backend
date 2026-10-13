# 🎬 Creative Portfolio Backend

A dependable, maintainable backend tailored for a creative portfolio (<50 MB video showreels, 3–5 MB photography, and written poems/essays).

---

## ⚙️ Dependencies

The backend utilizes standard Python libraries alongside focused, industry-standard packages for media inspection, image decoding, and streaming:

| Package | Minimum Version | Purpose |
| :--- | :--- | :--- |
| **Pillow** | `10.0.0+` | Full image decoding, structural verification, EXIF orientation normalization, and metadata stripping. |
| **mutagen** | `1.47.0+` | ISO-BMFF container & stream inspection for MP4/MOV files (rejects truncated files and stubs lacking movie/track headers). |
| **python-multipart** | `0.0.20+` | Stream form-data parsing reference utilities. |

Install all dependencies via `requirements.txt`:
```bash
pip install -r requirements.txt
```

---

## 🚀 Quickstart & Local Setup

### 1. Installation
Clone or navigate to the repository directory:
```bash
cd /home/abe/.gemini/antigravity/scratch/portfolio-backend
pip install -r requirements.txt
```

### 2. Start the Server
```bash
python3 server.py
```
By default, the server listens on `http://localhost:8000`. You can specify a different port:
```bash
python3 server.py 8080
```

On first startup:
- Creates the SQLite database (`portfolio.db`) in WAL mode with indexes.
- Generates a secure administrative token in `.admin_token` (or reads `PORTFOLIO_ADMIN_TOKEN` from your environment).
- Performs startup recovery: purges any stale files in `.tmp_uploads` and cleans up unfinished deletions.

### 3. Open the Dashboard
Navigate to `http://localhost:8000` in any web browser to view the portfolio catalog, test media uploads, compose poems, and test video scrubbing.

### 4. Run the Regression Suite
```bash
python3 test_server.py
```
Runs 14 repeatable verification tests covering parser edge cases, disconnects, true media validation, memory bounds, and deletion recovery.

---

## 🛡️ Architecture & Verification Details

### 1. Upload Parsing & Request Completion
- **RFC 2046 Streaming Parser**: Correctly distinguishes delimiter lines from file data. Payloads containing boundary prefixes (e.g. `AAA\r\n--BXYZ\r\nBBB`) or false closing delimiters (e.g. `\r\n--B--XYZ`) are preserved with 100% byte integrity.
- **Enforced Body Completion**: If a request declares `Content-Length: 128 KiB`, transmits 64 KiB with an early closing delimiter, and disconnects, the server drains the stream. Because the connection closed before the declared body completed, the upload is rejected with `400 Bad Request` and never published.
- **Connection Handling**: Rejected requests set `Connection: close` to prevent socket desynchronization.

### 2. Media Handling & Privacy Policy
- **Photos (JPEG, PNG, WebP)**:
  - Validated by full decoding through Pillow (`img.verify()` and load pass). Corrupt or masquerading files are rejected.
  - **Orientation Policy**: EXIF orientation is normalized using `ImageOps.exif_transpose`, rotating the pixel data directly so the photo displays upright on all screens.
  - **Metadata Removal**: Saved clean without EXIF, GPS location tags, camera make/model, or IPTC comments.
- **Videos (MP4, MOV, WebM)**:
  - Validated by structural inspection through Mutagen. The container must contain valid `ftyp`, `moov`, movie header (`mvhd`), and active stream tracks. Stubs such as `0000ftyp` lacking movie headers are rejected.
  - WebM containers are validated for EBML header IDs, DocType (`webm`/`matroska`), and Segment headers.

### 3. Persistence, Deletion Recovery & File Serving
- **Decoupled Persistence**: Responses are sent inside guarded handlers. If a client disconnects while the server delivers the HTTP response, the committed database record and file remain safe.
- **Status-Aware File Serving**: The `/uploads/...` route checks `database.is_media_active_by_url(path)`. Any item marked `pending_delete` or removed from SQLite returns `404 Not Found`.
- **Deletion Retries**: If disk unlinking encounters an OS permission error, the item transitions to `pending_delete`. Subsequent deletion attempts retry unlinking and permanently delete the database record on success.
- **Cleanup Utilities**: Startup routines and `POST /api/admin/cleanup` safely purge abandoned temporary uploads and finalize pending deletions.

### 4. Bounded Request Limits
- **File limits**: Videos capped at 50 MB; images capped at 10 MB; global payload cap at 60 MB.
- **Text & header limits**: Text fields capped at 10 KB; form part headers capped at 4 KB; max 10 parts per form.
- **Framing validation**: Chunked transfer encoding is rejected; `Content-Length` is mandatory on uploads.
- **Memory consumption**: Parser allocates in 64 KB streaming buffers, maintaining a flat memory profile (~192 KiB peak) independently of whether file sizes are 8 MB or 50 MB.

---

## 🔌 API Reference

### 📝 Poems
- `GET /api/poems` — List all active poems (optional: `?tag=reflection`)
- `GET /api/poems/<id>` — Get single poem
- `POST /api/poems` — Create poem (requires `X-Admin-Token` or `Authorization: Bearer <token>`)
- `PUT /api/poems/<id>` — Update poem
- `DELETE /api/poems/<id>` — Delete poem

### 🎬 Media
- `GET /api/media` — List all active media (optional: `?type=video` or `?type=image`)
- `GET /api/media/<id>` — Get metadata for item
- `GET /uploads/videos/<filename>` — Stream video with RFC 9110 byte-range seeking (`206 Partial Content`)
- `GET /uploads/images/<filename>` — Serve sanitized image
- `POST /api/upload` — Multipart form upload (`file`, `title`, `description`)
- `POST /api/upload/raw?filename=showreel.mp4&title=Reel` — Raw streaming upload
- `DELETE /api/media/<id>` — Deletion with state recovery machine

### 📊 System & Maintenance
- `GET /api/health` — Health and version info
- `GET /api/stats` — Item counts and total storage used
- `POST /api/admin/cleanup` — Admin trigger for temporary file and deletion cleanup

---

## 📋 Deployment Readiness Assessment

### What is verified and dependable in this version:
- Robust multi-threaded HTTP/1.1 serving with RFC 9110 range playback for instant video seeking.
- Structural decoding and validation of photos and video containers.
- Guaranteed connection and file cleanup on interruptions or failed uploads.
- Strict path traversal prevention and status-aware asset serving.

### What is needed before public deployment:
1. **Reverse Proxy / TLS Termination**: Place an established web server (such as Caddy or Nginx) in front of Python to handle HTTPS/TLS certificates, rate limiting, and slowloris protection.
2. **Environment Variable Configuration**: Set `PORTFOLIO_ADMIN_TOKEN` as a secret environment variable rather than relying on local token files.
3. **Automated Backups**: Periodically copy `portfolio.db` (using SQLite's online backup API or `sqlite3 .backup`) and the `uploads/` folder to remote object storage.
