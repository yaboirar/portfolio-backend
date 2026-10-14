"""
Database layer for Creative Portfolio Backend.
Uses SQLite with Write-Ahead Logging (WAL) and strict connection lifecycle management.
Features:
- Guaranteed connection closure in finally blocks (zero connection leaks)
- Deletion recovery state machine: media items support status ('active', 'pending_delete')
- Public queries only return active media
"""

import sqlite3
import os
import datetime
from pathlib import Path
from contextlib import contextmanager
from typing import List, Dict, Any, Optional, Tuple
import hashlib
import secrets

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "portfolio.db")


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA foreign_keys = ON;")
        with conn:
            yield conn
    finally:
        conn.close()


def init_db() -> None:
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. Poems table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS poems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            mood TEXT DEFAULT 'reflective',
            tags TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """)
        
        # 2. Media table with status column for safe deletion recovery
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS media (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            media_type TEXT NOT NULL CHECK(media_type IN ('video', 'image', 'other')),
            filename TEXT NOT NULL,
            relative_url TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            mime_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL
        );
        """)
        
        # Add status column if existing DB lacked it
        cols = [c[1] for c in cursor.execute("PRAGMA table_info(media)").fetchall()]
        if "status" not in cols:
            cursor.execute("ALTER TABLE media ADD COLUMN status TEXT NOT NULL DEFAULT 'active';")

        # 3. Admins table for username/password authentication
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        """)

        # 4. Sessions table for authenticated token sessions
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            admin_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
        );
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_media_type ON media(media_type);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_media_status ON media(status);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_media_url ON media(relative_url);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_poems_created ON poems(created_at DESC);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_media_created ON media(created_at DESC);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);")


# --- Poems CRUD ---

def create_poem(title: str, content: str, mood: str = "reflective", tags: str = "") -> Dict[str, Any]:
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO poems (title, content, mood, tags, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (title.strip(), content.strip(), mood.strip(), tags.strip(), now, now))
        poem_id = cursor.lastrowid
        cursor.execute("SELECT * FROM poems WHERE id = ?", (poem_id,))
        return dict(cursor.fetchone())


def get_all_poems(tag: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        if tag:
            cursor.execute("SELECT * FROM poems WHERE tags LIKE ? ORDER BY id DESC", (f"%{tag}%",))
        else:
            cursor.execute("SELECT * FROM poems ORDER BY id DESC")
        return [dict(row) for row in cursor.fetchall()]


def get_poem_by_id(poem_id: int) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM poems WHERE id = ?", (poem_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def update_poem(poem_id: int, title: str, content: str, mood: str = "reflective", tags: str = "") -> Optional[Dict[str, Any]]:
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE poems
            SET title = ?, content = ?, mood = ?, tags = ?, updated_at = ?
            WHERE id = ?
        """, (title.strip(), content.strip(), mood.strip(), tags.strip(), now, poem_id))
        if cursor.rowcount == 0:
            return None
        cursor.execute("SELECT * FROM poems WHERE id = ?", (poem_id,))
        return dict(cursor.fetchone())


def delete_poem(poem_id: int) -> bool:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM poems WHERE id = ?", (poem_id,))
        return cursor.rowcount > 0


# --- Media CRUD with Deletion Recovery State ---

def create_media(title: str, description: str, media_type: str, filename: str,
                 relative_url: str, file_size: int, mime_type: str) -> Dict[str, Any]:
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO media (title, description, media_type, filename, relative_url, file_size, mime_type, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
        """, (title.strip(), description.strip(), media_type, filename, relative_url, file_size, mime_type, now))
        media_id = cursor.lastrowid
        cursor.execute("SELECT * FROM media WHERE id = ?", (media_id,))
        return dict(cursor.fetchone())


def get_all_media(media_type: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        if media_type:
            cursor.execute("SELECT * FROM media WHERE media_type = ? AND status = 'active' ORDER BY id DESC", (media_type,))
        else:
            cursor.execute("SELECT * FROM media WHERE status = 'active' ORDER BY id DESC")
        return [dict(row) for row in cursor.fetchall()]


def get_media_by_id(media_id: int) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM media WHERE id = ? AND status = 'active'", (media_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def mark_media_pending_delete(media_id: int) -> Optional[Dict[str, Any]]:
    """Marks media as pending deletion. Immediately hides it from visitors."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM media WHERE id = ?", (media_id,))
        row = cursor.fetchone()
        if not row:
            return None
        cursor.execute("UPDATE media SET status = 'pending_delete' WHERE id = ?", (media_id,))
        return dict(row)


def delete_media_final(media_id: int) -> Optional[Dict[str, Any]]:
    """Permanently purges record once disk unlinking succeeds."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM media WHERE id = ?", (media_id,))
        row = cursor.fetchone()
        if not row:
            return None
        item = dict(row)
        cursor.execute("DELETE FROM media WHERE id = ?", (media_id,))
        return item


def is_media_active_by_url(relative_url: str) -> bool:
    """Checks if a media file has an active record in SQLite (blocks access if deleted or pending_delete)."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM media WHERE relative_url = ? AND status = 'active' LIMIT 1", (relative_url,))
        if cursor.fetchone() is not None:
            return True
        # If this is an HLS segment (.ts or similar), check if its parent index.m3u8 is active
        if "/videos/" in relative_url:
            parent_m3u8 = str(Path(relative_url).parent / "index.m3u8")
            cursor.execute("SELECT 1 FROM media WHERE relative_url = ? AND status = 'active' LIMIT 1", (parent_m3u8,))
            if cursor.fetchone() is not None:
                return True
        return False


def get_all_pending_deletions() -> List[Dict[str, Any]]:
    """Returns all media records currently in pending_delete status."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM media WHERE status = 'pending_delete'")
        return [dict(row) for row in cursor.fetchall()]


def cleanup_unfinished_deletions(uploads_dir) -> int:
    """
    Scans for media items marked 'pending_delete', removes disk files if still present,
    and permanently deletes the database records.
    Returns the count of purged items.
    """
    from pathlib import Path
    pending = get_all_pending_deletions()
    purged_count = 0
    base_uploads = Path(uploads_dir).resolve()
    for item in pending:
        rel_url = item.get("relative_url", "")
        if not rel_url.startswith("/uploads/"):
            continue
        rel_disk = rel_url[len("/uploads/"):].lstrip("/")
        try:
            disk_target = (base_uploads / rel_disk).resolve()
            if not disk_target.is_relative_to(base_uploads):
                continue
            if disk_target.exists():
                if not disk_target.is_file():
                    continue
                disk_target.unlink()
        except FileNotFoundError:
            pass  # Another deletion already removed the file.
        except (OSError, ValueError, RuntimeError):
            continue  # Keep the recovery record so a later cleanup can retry.
        delete_media_final(item["id"])
        purged_count += 1
    return purged_count


# --- Stats ---

def get_stats() -> Dict[str, Any]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM poems")
        poem_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM media WHERE media_type = 'video' AND status = 'active'")
        video_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM media WHERE media_type = 'image' AND status = 'active'")
        image_count = cursor.fetchone()[0]
        cursor.execute("SELECT COALESCE(SUM(file_size), 0) FROM media WHERE status = 'active'")
        total_media_bytes = cursor.fetchone()[0]
        return {
            "poem_count": poem_count,
            "video_count": video_count,
            "image_count": image_count,
            "total_media_bytes": total_media_bytes,
            "total_media_mb": round(total_media_bytes / (1024 * 1024), 2)
        }


# --- Admin Authentication & Session Management ---

def hash_password(password: str, salt: Optional[str] = None) -> Tuple[str, str]:
    """Hashes a password using PBKDF2-HMAC-SHA256 with a secure random salt."""
    if not salt:
        salt = secrets.token_hex(16)
    pwd_bytes = password.encode("utf-8")
    salt_bytes = salt.encode("utf-8")
    key = hashlib.pbkdf2_hmac("sha256", pwd_bytes, salt_bytes, 200_000)
    return key.hex(), salt


def verify_password(password: str, password_hash: str, salt: str) -> bool:
    """Verifies a plaintext password against stored hash and salt using constant-time comparison."""
    calculated_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(calculated_hash, password_hash)


def get_admin_count() -> int:
    """Returns the total number of registered admin accounts."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM admins")
        return cursor.fetchone()[0]


def get_admin_by_username(username: str) -> Optional[Dict[str, Any]]:
    """Fetches an admin record by case-insensitive username."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM admins WHERE LOWER(username) = LOWER(?)", (username.strip(),))
        row = cursor.fetchone()
        return dict(row) if row else None


def get_admin_by_id(admin_id: int) -> Optional[Dict[str, Any]]:
    """Fetches an admin record by ID without password details."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, created_at FROM admins WHERE id = ?", (admin_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def create_admin(username: str, password: str) -> Dict[str, Any]:
    """Registers a new admin user."""
    clean_username = username.strip()
    if not clean_username or len(clean_username) < 3 or len(clean_username) > 32:
        raise ValueError("Username must be between 3 and 32 characters")
    if not password or len(password) < 6:
        raise ValueError("Password must be at least 6 characters")
    
    pwd_hash, salt = hash_password(password)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO admins (username, password_hash, salt, created_at)
            VALUES (?, ?, ?, ?)
        """, (clean_username, pwd_hash, salt, now))
        admin_id = cursor.lastrowid
        return {
            "id": admin_id,
            "username": clean_username,
            "created_at": now
        }


def create_session(admin_id: int, duration_days: int = 7) -> str:
    """Creates a new session token for an authenticated admin."""
    token = secrets.token_hex(32)
    now_dt = datetime.datetime.now(datetime.timezone.utc)
    expires_dt = now_dt + datetime.timedelta(days=duration_days)
    
    now_iso = now_dt.isoformat()
    expires_iso = expires_dt.isoformat()
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO sessions (token, admin_id, created_at, expires_at)
            VALUES (?, ?, ?, ?)
        """, (token, admin_id, now_iso, expires_iso))
        return token


def validate_session(token: str) -> Optional[Dict[str, Any]]:
    """Validates a session token. Returns admin info if valid, None otherwise."""
    if not token or len(token) < 16:
        return None
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.token, s.admin_id, s.expires_at, a.username
            FROM sessions s
            JOIN admins a ON s.admin_id = a.id
            WHERE s.token = ?
        """, (token,))
        row = cursor.fetchone()
        if not row:
            return None
        
        # Check expiry
        if row["expires_at"] <= now_iso:
            cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
            return None
            
        return {
            "token": row["token"],
            "admin_id": row["admin_id"],
            "username": row["username"],
            "expires_at": row["expires_at"]
        }


def delete_session(token: str) -> bool:
    """Removes a session (logs out)."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
        return cursor.rowcount > 0


def cleanup_expired_sessions() -> int:
    """Deletes expired session records."""
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sessions WHERE expires_at <= ?", (now_iso,))
        return cursor.rowcount

