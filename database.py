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
import json
import datetime
from pathlib import Path
from contextlib import contextmanager
from typing import List, Dict, Any, Optional, Tuple
import hashlib
import secrets
import re

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
        cursor.execute("CREATE TABLE IF NOT EXISTS folders (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE UNIQUE, created_at TEXT NOT NULL)")
        cursor.execute("CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, message TEXT NOT NULL, level TEXT NOT NULL, created_at TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0)")
        folder_columns = {row[1] for row in cursor.execute('PRAGMA table_info(folders)')}
        for field, default in (('tag', ''), ('description', ''), ('color', '#9ca3af')):
            if field not in folder_columns:
                cursor.execute(f"ALTER TABLE folders ADD COLUMN {field} TEXT NOT NULL DEFAULT '{default}'")
        
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
        if "original_filename" not in cols:
            cursor.execute("ALTER TABLE media ADD COLUMN original_filename TEXT NOT NULL DEFAULT ''")
        for field,kind in (('duration_seconds','REAL'),('width','INTEGER'),('height','INTEGER')):
            if field not in cols:cursor.execute(f'ALTER TABLE media ADD COLUMN {field} {kind}')
        cursor.execute('CREATE TABLE IF NOT EXISTS media_shares (media_id INTEGER PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, expires_at INTEGER)')
        cursor.execute('CREATE TABLE IF NOT EXISTS share_egress (day TEXT PRIMARY KEY, bytes INTEGER NOT NULL DEFAULT 0)')
        for table in ('media', 'poems'):
            if 'folder_id' not in [row[1] for row in cursor.execute(f'PRAGMA table_info({table})')]:
                cursor.execute(f'ALTER TABLE {table} ADD COLUMN folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL')
            cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table}_folder ON {table}(folder_id)')

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

        # 4. Activity Logs table for rolling 7-day input/output tracking
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            epoch INTEGER NOT NULL,
            action TEXT NOT NULL,
            ip TEXT DEFAULT '',
            method TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            status_code INTEGER NOT NULL,
            input_data TEXT DEFAULT '',
            output_data TEXT DEFAULT '',
            error_message TEXT DEFAULT ''
        );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_logs_epoch ON activity_logs(epoch);")

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_media_type ON media(media_type);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_media_status ON media(status);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_media_url ON media(relative_url);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_poems_created ON poems(created_at DESC);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_media_created ON media(created_at DESC);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_media_filename_status ON media(filename, status);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username);")
        # Legacy sessions table compatibility
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            admin_id INTEGER,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);")


def get_notifications():
    with get_db() as conn:
        items = [dict(row) for row in conn.execute('SELECT * FROM notifications ORDER BY id DESC LIMIT 100')]
        return {'notifications': items, 'unread_count': sum(not item['is_read'] for item in items)}


def create_notification(title, message, level='success'):
    if not isinstance(title, str) or not 1 <= len(title.strip()) <= 80 or not isinstance(message, str) or len(message) > 500 or level not in ('success', 'error', 'info'):
        raise ValueError('Invalid notification')
    with get_db() as conn:
        item_id = conn.execute('INSERT INTO notifications (title, message, level, created_at) VALUES (?, ?, ?, ?)', (title.strip(), message, level, datetime.datetime.now(datetime.timezone.utc).isoformat())).lastrowid
        conn.execute('DELETE FROM notifications WHERE id NOT IN (SELECT id FROM notifications ORDER BY id DESC LIMIT 100)')
        return dict(conn.execute('SELECT * FROM notifications WHERE id = ?', (item_id,)).fetchone())


def read_notifications(through_id):
    if type(through_id) is not int or through_id < 0:
        raise ValueError('Invalid notification selection')
    with get_db() as conn:
        conn.execute('UPDATE notifications SET is_read = 1 WHERE id <= ?', (through_id,))


def read_notification(notification_id):
    if type(notification_id) is not int or notification_id < 1:
        raise ValueError('Invalid notification selection')
    with get_db() as conn:
        conn.execute('UPDATE notifications SET is_read = 1 WHERE id = ?', (notification_id,))


def validate_folder(conn, folder_id):
    if folder_id is not None and (type(folder_id) is not int or folder_id < 1 or not conn.execute('SELECT 1 FROM folders WHERE id = ?', (folder_id,)).fetchone()):
        raise ValueError('Folder not found')


def folder_name(value):
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > 80:
        raise ValueError('Folder names must contain 1–80 characters')
    return value.strip()


def get_folders():
    with get_db() as conn:
        return [dict(row) for row in conn.execute("SELECT f.*, (SELECT COUNT(*) FROM media WHERE folder_id = f.id AND status = 'active') + (SELECT COUNT(*) FROM poems WHERE folder_id = f.id) AS item_count FROM folders f ORDER BY name COLLATE NOCASE")]


def save_folder(name, folder_id=None, tag=None, description=None, color=None):
    name = folder_name(name)
    try:
        with get_db() as conn:
            current = conn.execute('SELECT * FROM folders WHERE id = ?', (folder_id,)).fetchone() if folder_id is not None else None
            values = {}
            for field, value, default, limit in (('tag', tag, '', 80), ('description', description, '', 2000), ('color', color, '#9ca3af', 7)):
                value = current[field] if value is None and current else default if value is None else value
                if not isinstance(value, str) or len(value) > limit:
                    raise ValueError(f'Invalid folder {field}')
                values[field] = value.strip()
            if not re.fullmatch(r'#[0-9a-fA-F]{6}', values['color']):
                raise ValueError('Choose a valid folder color')
            if folder_id is None:
                folder_id = conn.execute('INSERT INTO folders (name, created_at, tag, description, color) VALUES (?, ?, ?, ?, ?)', (name, datetime.datetime.now(datetime.timezone.utc).isoformat(), values['tag'], values['description'], values['color'])).lastrowid
            else:
                validate_folder(conn, folder_id)
                conn.execute('UPDATE folders SET name = ?, tag = ?, description = ?, color = ? WHERE id = ?', (name, values['tag'], values['description'], values['color'], folder_id))
            return dict(conn.execute('SELECT * FROM folders WHERE id = ?', (folder_id,)).fetchone())
    except sqlite3.IntegrityError:
        raise ValueError('A folder with this name already exists') from None


def delete_folder(folder_id):
    # Only the container is removed. ON DELETE SET NULL preserves every file.
    with get_db() as conn:
        validate_folder(conn, folder_id)
        conn.execute('DELETE FROM folders WHERE id = ?', (folder_id,))


def move_folder_items(items, folder_id):
    if not isinstance(items, list) or not 1 <= len(items) <= 1000:
        raise ValueError('Select 1–1000 files')
    targets = set()
    for item in items:
        if not isinstance(item, dict) or item.get('kind') not in ('media', 'poem') or type(item.get('id')) is not int or item['id'] < 1:
            raise ValueError('Invalid file selection')
        targets.add(('media' if item['kind'] == 'media' else 'poems', item['id']))
    with get_db() as conn:
        validate_folder(conn, folder_id)
        for table, item_id in targets:
            active = " AND status = 'active'" if table == 'media' else ''
            if not conn.execute(f'SELECT 1 FROM {table} WHERE id = ?{active}', (item_id,)).fetchone():
                raise ValueError('A selected file no longer exists. Refresh and try again')
        for table, item_id in targets:
            conn.execute(f'UPDATE {table} SET folder_id = ? WHERE id = ?', (folder_id, item_id))
    return len(targets)


# --- Poems CRUD ---

def create_poem(title: str, content: str, mood: str = "reflective", tags: str = "", folder_id=None) -> Dict[str, Any]:
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with get_db() as conn:
        validate_folder(conn, folder_id)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO poems (title, content, mood, tags, created_at, updated_at, folder_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (title.strip(), content.strip(), mood.strip(), tags.strip(), now, now, folder_id))
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
                 relative_url: str, file_size: int, mime_type: str, original_filename: str = '', folder_id=None) -> Dict[str, Any]:
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with get_db() as conn:
        validate_folder(conn, folder_id)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO media (title, description, media_type, filename, relative_url, file_size, mime_type, status, created_at, original_filename, folder_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
        """, (title.strip(), description.strip(), media_type, filename, relative_url, file_size, mime_type, now, original_filename, folder_id))
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


def save_media_metadata(media_id, values):
    with get_db() as conn:
        conn.execute("UPDATE media SET width=?, height=?, duration_seconds=? WHERE id=? AND status='active'",(values.get('width'),values.get('height'),values.get('duration_seconds'),media_id))


def create_media_share(media_id, expires_in=604800):
    if type(expires_in) is not int or expires_in not in (0,86400,604800,2592000):raise ValueError('Choose a valid expiry')
    token=secrets.token_urlsafe(24)
    now=int(datetime.datetime.now(datetime.timezone.utc).timestamp())
    with get_db() as conn:
        conn.execute('BEGIN IMMEDIATE')
        item=conn.execute("SELECT id FROM media WHERE id=? AND media_type='video' AND status='active'",(media_id,)).fetchone()
        if not item:raise ValueError('Video not found')
        expires_at=now+expires_in if expires_in else None
        conn.execute('INSERT INTO media_shares VALUES (?,?,?,?) ON CONFLICT(media_id) DO UPDATE SET token_hash=excluded.token_hash, created_at=excluded.created_at, expires_at=excluded.expires_at',(media_id,hashlib.sha256(token.encode()).hexdigest(),now,expires_at))
    return {'token':token,'expires_at':expires_at,'created_at':now}


def get_media_share(media_id):
    with get_db() as conn:
        row=conn.execute('SELECT created_at, expires_at FROM media_shares WHERE media_id=?',(media_id,)).fetchone()
    now=int(datetime.datetime.now(datetime.timezone.utc).timestamp())
    return dict(row) if row and (row['expires_at'] is None or row['expires_at']>now) else None


def resolve_media_share(token):
    if not isinstance(token,str) or not re.fullmatch(r'[A-Za-z0-9_-]{32}',token):return None
    now=int(datetime.datetime.now(datetime.timezone.utc).timestamp())
    with get_db() as conn:
        row=conn.execute("SELECT m.* FROM media_shares s JOIN media m ON m.id=s.media_id WHERE s.token_hash=? AND (s.expires_at IS NULL OR s.expires_at>?) AND m.status='active' AND m.media_type='video'",(hashlib.sha256(token.encode()).hexdigest(),now)).fetchone()
    return dict(row) if row else None


def revoke_media_share(media_id):
    with get_db() as conn:conn.execute('DELETE FROM media_shares WHERE media_id=?',(media_id,))


def reserve_share_bytes(amount, limit):
    day=datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    with get_db() as conn:
        conn.execute('BEGIN IMMEDIATE')
        conn.execute('DELETE FROM share_egress WHERE day < ?',(day,))
        conn.execute('INSERT OR IGNORE INTO share_egress VALUES (?,0)',(day,))
        used=conn.execute('SELECT bytes FROM share_egress WHERE day=?',(day,)).fetchone()[0]
        if used+amount>limit:return None
        conn.execute('UPDATE share_egress SET bytes=bytes+? WHERE day=?',(amount,day))
    return day


def refund_share_bytes(day, amount):
    if amount<=0:return
    with get_db() as conn:conn.execute('UPDATE share_egress SET bytes=MAX(0,bytes-?) WHERE day=?',(amount,day))


def get_media_by_id(media_id: int) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM media WHERE id = ? AND status = 'active'", (media_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def update_media_details(media_id: int, title: str, description: str) -> Optional[Dict[str, Any]]:
    """Change editable labels while preserving the stored original and technical metadata."""
    with get_db() as conn:
        cursor = conn.execute("UPDATE media SET title = ?, description = ? WHERE id = ? AND status = 'active'", (title.strip(), description.strip(), media_id))
        if not cursor.rowcount:
            return None
        row = conn.execute("SELECT * FROM media WHERE id = ?", (media_id,)).fetchone()
        return dict(row)


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
        # Original files remain private and follow the same active/deleted state
        # as their record, including records that still point to a legacy HLS URL.
        prefix = '/uploads/videos/'
        if relative_url.startswith(prefix) and '/' not in relative_url[len(prefix):]:
            cursor.execute("SELECT 1 FROM media WHERE filename=? AND status='active' AND media_type='video' LIMIT 1", (relative_url[len(prefix):],))
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
    import media_storage
    with get_db() as conn:
        items=[dict(row) for row in conn.execute("SELECT * FROM media WHERE status='pending_delete'")]
    purged=0
    for item in items:
        try:
            revoke_media_share(item['id'])
            media_storage.remove_files(item,uploads_dir)
        except (OSError,ValueError):continue
        delete_media_final(item['id']);purged+=1
    return purged


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


def get_admin_count() -> int:
    """Returns the total number of registered admin accounts."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM admins")
        return cursor.fetchone()[0]


# --- Rolling 7-Day Activity Audit Logs ---

def log_activity(
    action: str,
    method: str,
    endpoint: str,
    status_code: int,
    ip: str = "",
    input_data: Any = "",
    output_data: Any = "",
    error_message: str = ""
) -> None:
    """Logs incoming inputs and outputs, automatically pruning entries older than 7 days."""
    try:
        now = datetime.datetime.now(datetime.timezone.utc)
        epoch = int(now.timestamp())
        iso_time = now.isoformat()

        # Format input string and sanitize any passwords
        if isinstance(input_data, (dict, list)):
            safe_input = json.dumps(input_data)
        else:
            safe_input = str(input_data or "")

        if "password" in safe_input.lower():
            try:
                parsed = json.loads(safe_input)
                if isinstance(parsed, dict):
                    for k in list(parsed.keys()):
                        if "password" in k.lower():
                            parsed[k] = "******"
                    safe_input = json.dumps(parsed)
            except Exception:
                pass

        if isinstance(output_data, (dict, list)):
            safe_output = json.dumps(output_data)
        else:
            safe_output = str(output_data or "")

        with get_db() as conn:
            conn.execute(
                """INSERT INTO activity_logs (timestamp, epoch, action, ip, method, endpoint, status_code, input_data, output_data, error_message)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    iso_time,
                    epoch,
                    action,
                    str(ip or "")[:64],
                    method[:10],
                    endpoint[:256],
                    status_code,
                    safe_input[:2048],
                    safe_output[:2048],
                    str(error_message or "")[:1024]
                )
            )

            # Continuous loop cleanup: automatically delete logs older than 7 days (7 * 86,400 seconds)
            cutoff_epoch = epoch - (7 * 86400)
            conn.execute("DELETE FROM activity_logs WHERE epoch < ?", (cutoff_epoch,))
    except Exception:
        # Logging should never crash application requests
        pass


def get_recent_activity_logs(limit: int = 100) -> List[Dict[str, Any]]:
    """Returns the most recent activity logs, pruning any older than 7 days first."""
    cutoff_epoch = int(datetime.datetime.now(datetime.timezone.utc).timestamp()) - (7 * 86400)
    with get_db() as conn:
        conn.execute("DELETE FROM activity_logs WHERE epoch < ?", (cutoff_epoch,))
        cursor = conn.cursor()
        rows = cursor.execute(
            """SELECT id, timestamp, epoch, action, ip, method, endpoint, status_code, input_data, output_data, error_message
               FROM activity_logs
               ORDER BY epoch DESC, id DESC
               LIMIT ?""",
            (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


