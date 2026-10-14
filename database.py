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
from contextlib import contextmanager
from typing import List, Dict, Any, Optional

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

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_media_type ON media(media_type);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_media_status ON media(status);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_media_url ON media(relative_url);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_poems_created ON poems(created_at DESC);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_media_created ON media(created_at DESC);")


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

