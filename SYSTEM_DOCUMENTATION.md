# Creative Portfolio System Architecture & Operations Manual

This document is the single source of truth for the **Creative Portfolio** web application, backend API, VPS infrastructure, database architecture, and deployment procedures. Any AI agent or developer can use this guide to understand, maintain, debug, and extend the system without prior context.

---

## 1. Quick Reference & System Summary

| Component | Value / Location |
| :--- | :--- |
| **Production Website** | [https://yaboirar.web.id](https://yaboirar.web.id) (and `https://www.yaboirar.web.id`) |
| **VPS Provider & OS** | Microsoft Azure Linux Virtual Machine (Ubuntu 24.04 LTS) |
| **VPS Public IP** | `20.187.124.90` |
| **SSH User** | `azureuser` |
| **SSH Private Keys (Windows)** | `C:\Users\fathi\.ssh\portfolio_key.pem`<br>`C:\Users\fathi\.ssh\id_rsa_portfolio.pem` |
| **SSH Private Key (Linux/WSL)** | `~/.ssh/portfolio-backend_key.pem` or `/home/abe/.ssh/portfolio-backend_key.pem` |
| **Admin Username** | `yaboirar` |
| **Admin Password** | `PortfolioAdmin2026!Secure` |
| **Admin UI Route** | [https://yaboirar.web.id/login](https://yaboirar.web.id/login) |
| **Git Repository** | `https://github.com/yaboirar/portfolio-backend.git` (Private, branch `main`) |
| **Remote Project Path** | `/home/azureuser/portfolio-backend/` |
| **Local Project Path** | `/home/abe/.gemini/antigravity/scratch/portfolio-backend/` |

---

## 2. Server Infrastructure & Topology

```
                       [ Incoming Visitors / Admin ]
                                    │
                                    ▼ (HTTPS :443 / HTTP :80)
                       ┌─────────────────────────┐
                       │   Caddy Reverse Proxy   │
                       │ (Auto TLS via Let's Enc)│
                       └────────────┬────────────┘
                                    │ (Reverse proxy to http://127.0.0.1:8000)
                                    ▼
                       ┌─────────────────────────┐
                       │  Python ThreadingServer │
                       │    (server.py :8000)    │
                       └──────┬───────────┬──────┘
                              │           │
            ┌─────────────────┴─┐       ┌─┴────────────────┐
            ▼                   ▼       ▼                  ▼
     SQLite3 Database      Local Disk   FFmpeg / FFprobe  Auth / CSRF Engine
    (`portfolio.db`)      (`uploads/`)  (Video pipeline)     (`auth.py`)
```

### Systemd Service: `portfolio.service`
The Python backend runs under `systemd` on the Azure VM.
- **Service Name**: `portfolio.service`
- **Unit File**: `/etc/systemd/system/portfolio.service`
- **Working Directory**: `/home/azureuser/portfolio-backend`
- **ExecStart**: `/home/azureuser/portfolio-backend/.venv/bin/python server.py 8000`
- **Environment**: `PUBLIC_ORIGIN=https://yaboirar.web.id`

#### Common Server Commands:
```bash
# Check status
sudo systemctl status portfolio.service

# Restart service
sudo systemctl restart portfolio.service

# Stream live service logs
sudo journalctl -u portfolio.service -f

# Check Caddy reverse proxy logs
sudo journalctl -u caddy -f
```

---

## 3. Tech Stack & Directory Structure

```
portfolio-backend/
├── auth.py              # Cookie session auth, PBKDF2 hashing, CSRF guards, rate-limiting
├── database.py          # SQLite layer (WAL mode), CRUD operations, 7-day activity log loop
├── server.py            # HTTP request handler, streaming uploads, RFC 9110 range requests
├── upload_parser.py     # Werkzeug-based streaming multipart parser (memory bounded)
├── create_admin.py      # CLI script to create/reset administrator passwords
├── portfolio.db         # SQLite database file
├── requirements.txt     # Python dependencies (Pillow, Werkzeug)
├── test_server.py       # Consolidated integration regression test suite (15 tests)
├── test_backend.py      # Video and unit test suite
├── tests/
│   └── test_auth.py     # Comprehensive authentication & security regression tests (11 tests)
├── uploads/             # Permanent storage for processed files
│   ├── images/          # Compressed and EXIF-normalized JPEG/PNG/WebP files
│   └── videos/          # Transcoded MP4 files and HLS multi-bitrate streams (.m3u8, .ts)
├── .tmp_uploads/        # Temporary staging directory for active uploads (auto-cleaned)
└── static/              # Frontend Single Page Application (SPA)
    ├── index.html       # Single-page layout, modals, lightbox, upload drawer, log viewer
    ├── app.js           # Client application logic, feeds, XHR upload progress listeners
    ├── auth-ui.js       # SPA authentication controller for /login and /register, CSRF handling
    ├── auth-ui.css      # Dark-themed styling for auth screens and 7-day activity log viewer
    ├── style.css        # Portfolio layout, grid, and animations
    └── hls.min.js       # HLS.js player library for streaming video playback
```

---

## 4. Database Schema (`portfolio.db`)

The database uses SQLite with Write-Ahead Logging (`PRAGMA journal_mode=WAL`) and foreign key constraints enabled.

### Tables

#### 1. `media`
Stores uploaded videos and photos.
```sql
CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    media_type TEXT NOT NULL,       -- 'image' or 'video'
    filename TEXT NOT NULL,
    relative_url TEXT NOT NULL,     -- e.g. '/uploads/videos/abc.mp4' or '/uploads/videos/abc/index.m3u8'
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    status TEXT DEFAULT 'active',   -- 'active' or 'pending_delete'
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_type ON media(media_type);
CREATE INDEX IF NOT EXISTS idx_media_status ON media(status);
CREATE INDEX IF NOT EXISTS idx_media_url ON media(relative_url);
CREATE INDEX IF NOT EXISTS idx_media_created ON media(created_at DESC);
```

#### 2. `poems`
Stores written poetry and creative thoughts.
```sql
CREATE TABLE IF NOT EXISTS poems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    mood TEXT DEFAULT 'reflective',
    tags TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_poems_created ON poems(created_at DESC);
```

#### 3. `admins`
Stores administrator accounts.
```sql
CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,    -- PBKDF2-HMAC-SHA256 hex digest
    salt TEXT NOT NULL,             -- 16-byte hex salt
    created_at TEXT NOT NULL,
    password_iterations INTEGER NOT NULL DEFAULT 600000
);
CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username);
```

#### 4. `auth_sessions`
Stores cryptographically hashed session tokens (never raw tokens).
```sql
CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,    -- SHA-256 hash of the session token cookie
    admin_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,    -- Unix epoch timestamp
    expires_at INTEGER NOT NULL,    -- 8-hour absolute expiration
    last_seen INTEGER NOT NULL,     -- 30-minute idle sliding expiration
    FOREIGN KEY(admin_id) REFERENCES admins(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS auth_session_admin ON auth_sessions(admin_id);
```

#### 5. `auth_limits`
Persistent IP- and username-based rate-limiting buckets (10 attempts per 10-minute window).
```sql
CREATE TABLE IF NOT EXISTS auth_limits (
    bucket TEXT PRIMARY KEY,
    reset_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL
);
```

#### 6. `activity_logs`
7-day rolling audit trail recording incoming inputs and outputs.
```sql
CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,        -- ISO 8601 UTC timestamp
    epoch INTEGER NOT NULL,         -- Unix timestamp for fast indexed cleanup
    action TEXT NOT NULL,           -- e.g. 'upload_media', 'delete_media', 'login_success'
    ip TEXT DEFAULT '',
    method TEXT NOT NULL,           -- 'GET', 'POST', 'PUT', 'DELETE'
    endpoint TEXT NOT NULL,         -- e.g. '/api/upload', '/api/poems'
    status_code INTEGER NOT NULL,   -- 200, 201, 400, 401, 500
    input_data TEXT DEFAULT '',     -- Sanitized JSON string (passwords automatically masked)
    output_data TEXT DEFAULT '',    -- Result payload summary
    error_message TEXT DEFAULT ''   -- Diagnostic error message if failed
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_epoch ON activity_logs(epoch);
```
> **Self-Cleaning Retention**: Every time `log_activity()` or `get_recent_activity_logs()` executes, it runs `DELETE FROM activity_logs WHERE epoch < (now - 604800)`. Logs older than 7 days are automatically pruned in a perpetual rolling loop.

---

## 5. Security & Authentication Architecture

1. **Cookie-Only Session Tokens**:
   - Token is a 32-byte cryptographically secure random string stored in an `HttpOnly`, `SameSite=Lax`, `Secure` cookie named `session_token`.
   - Raw tokens are never stored in the database. The database only stores `SHA-256(token)`.
   - Token lifetime: **8 hours absolute**, **30 minutes idle timeout**.
2. **CSRF & Origin Enforcement**:
   - Every state-changing API request (`POST`, `PUT`, `PATCH`, `DELETE`) requires:
     1. Matching `Origin` header (must match `PUBLIC_ORIGIN` / `https://yaboirar.web.id`).
     2. `X-Requested-With: portfolio-admin` header.
     3. `X-CSRF-Token: <token>` header matching `HMAC-SHA256(session_token, csrf_key)`.
3. **Password Security**:
   - Passwords hashed with `PBKDF2-HMAC-SHA256` using 600,000 iterations and per-user 16-byte random salts.
4. **Content-Security-Policy (CSP)**:
   - Configured in `server.py`:
     ```
     default-src 'none'; connect-src 'self'; media-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'
     ```
   - `blob:` is explicitly allowed for both `media-src` and `img-src` to enable instant client-side video and photo previews in the upload drawer via `URL.createObjectURL(file)`.

---

## 6. API Reference

### Public Endpoints (No Auth Required)

| Method | Endpoint | Description | Query Parameters |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Service health status | None |
| `GET` | `/api/stats` | Media and poem counters | None |
| `GET` | `/api/media` | Active media gallery | `?type=video` or `?type=image` |
| `GET` | `/api/media/<id>` | Single media item details | None |
| `GET` | `/api/poems` | Published poems | `?mood=reflective` or `?tag=...` |
| `GET` | `/api/poems/<id>` | Single poem item | None |
| `GET` | `/uploads/videos/*` | Stream video file / HLS segments | Supports RFC 9110 byte ranges (`206 Partial Content`) |
| `GET` | `/uploads/images/*` | Static image file | None |

### Authentication Endpoints

| Method | Endpoint | Headers Required | Payload / Response |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/auth/status` | None | Returns `{ authenticated: bool, username: str, csrf_token: str }` |
| `POST` | `/api/auth/login` | `Content-Type: application/json`<br>`X-Requested-With: portfolio-admin` | Body: `{"username": "...", "password": "..."}`<br>Sets `session_token` cookie |
| `POST` | `/api/auth/logout` | `Cookie: session_token=...`<br>`X-Requested-With: portfolio-admin`<br>`X-CSRF-Token: ...` | Revokes session and expires cookie |
| `POST` | `/api/auth/register` | `Content-Type: application/json`<br>`X-Requested-With: portfolio-admin` | Body: `{"username": "...", "password": "..."}`<br>Only available for owner |

### Protected Admin Endpoints (Require Auth Cookie + CSRF Headers)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/upload` | Multipart media upload (`file`, `title`, `description`). Max 60 MiB. |
| `DELETE` | `/api/media/<id>` | Two-step deletion: marks `pending_delete`, unlinks files from disk, then purges database row. |
| `POST` | `/api/poems` | Create new poem (`{"title": "...", "content": "...", "mood": "..."}`). |
| `PUT` | `/api/poems/<id>` | Update poem content or mood. |
| `DELETE` | `/api/poems/<id>` | Delete poem. |
| `GET` | `/api/admin/logs` | Fetch the recent 7-day rolling activity audit logs. |
| `POST` | `/api/admin/cleanup` | Retry any failed file unlinks marked as `pending_delete`. |

---

## 7. Media Upload Pipeline & Limits

1. **Size Limits**:
   - Total request payload: **60 MiB** (enforced by `server.py` and `upload_parser.py`).
   - Video files: up to **50 MiB**.
   - Photo files: up to **10 MiB**.
2. **Streaming & Memory Safety**:
   - Multipart bodies stream into `.tmp_uploads/` in 64 KiB chunks. Peak server RAM usage per upload is strictly bounded (~256 KiB).
3. **Client-Side Progress & Timeouts**:
   - Handled via `window.adminAuth.uploadWithProgress()` in `static/auth-ui.js` using `XMLHttpRequest` with upload event listeners.
   - Timeout is set to **15 minutes** (prevents previous 12s abort timeouts on slow networks).
   - Dynamic progress UI updates from 0% → 99% (Transcoding & Processing) → 100% (Complete).
4. **Validation & Transcoding**:
   - **Images**: Verified by Pillow, EXIF orientation corrected, re-encoded safely as JPEG, PNG, or WebP.
   - **Videos**: Validated by `ffprobe` (requires valid container, valid video stream, positive dimensions, positive finite duration). Transcoded using `ffmpeg` to standard H.264/AAC MP4 and optional multi-bitrate HLS directory.

---

## 8. Deployment & Development Runbook

### Connecting via SSH
From Windows:
```bash
ssh -i "C:\Users\fathi\.ssh\portfolio_key.pem" azureuser@20.187.124.90
```
From WSL / Linux:
```bash
ssh -i ~/.ssh/portfolio-backend_key.pem azureuser@20.187.124.90
```

### Running Test Suites Locally or on VM
Always run tests before and after making changes:
```bash
# 1. Run unit security & authentication tests (11 tests)
python3 -m unittest discover -s tests -v

# 2. Run consolidated server integration test suite (15 tests)
python3 test_server.py
```

### Deploying Changes to the Live VPS
From the local workspace (`/home/abe/.gemini/antigravity/scratch/portfolio-backend`):
```bash
# 1. Sync backend files
rsync -avz -e "ssh -i /home/abe/.ssh/portfolio-backend_key.pem" \
  auth.py database.py server.py upload_parser.py tests/ \
  azureuser@20.187.124.90:/home/azureuser/portfolio-backend/

# 2. Sync frontend files
rsync -avz -e "ssh -i /home/abe/.ssh/portfolio-backend_key.pem" \
  static/app.js static/auth-ui.css static/auth-ui.js static/index.html \
  azureuser@20.187.124.90:/home/azureuser/portfolio-backend/static/

# 3. Restart the backend service
ssh -i /home/abe/.ssh/portfolio-backend_key.pem azureuser@20.187.124.90 "sudo systemctl restart portfolio.service"

# 4. Verify service is running
ssh -i /home/abe/.ssh/portfolio-backend_key.pem azureuser@20.187.124.90 "sudo systemctl status portfolio.service --no-pager"
```

### Resetting or Creating an Admin Password
On the VPS:
```bash
cd /home/azureuser/portfolio-backend
.venv/bin/python create_admin.py yaboirar "YourNewSecurePassword123"
```

### Database Backup
The SQLite database can be safely backed up online without taking down the server:
```bash
sqlite3 /home/azureuser/portfolio-backend/portfolio.db ".backup '/home/azureuser/portfolio_backup_$(date +%Y%m%d).db'"
```
