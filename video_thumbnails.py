"""Small private video previews, generated lazily with a bounded single worker."""
import hashlib
import os
from pathlib import Path
import queue
import subprocess
import threading
import time
import database
import media_jobs

CACHE = Path(__file__).resolve().parent / 'uploads' / '.thumbnails'
_jobs = queue.Queue(maxsize=64)
_pending = set()
_failed = {}
_lock = threading.Lock()
_started = False
_cancelled = set()


def _worker():
    while True:
        source, target = _jobs.get()
        temp = target.with_name(target.stem + '.pending.jpg')
        try:
            CACHE.mkdir(parents=True, exist_ok=True)
            for seek in ('0.2', '0'):
                with _lock:
                    if str(target) in _cancelled:break
                media_jobs.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-threads', '1',
                                '-filter_threads', '1', '-protocol_whitelist', 'file,pipe',
                                '-ss', seek, '-i', str(source), '-frames:v', '1',
                                '-vf', 'scale=384:216:force_original_aspect_ratio=decrease',
                                '-an', '-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1', '-threads', '1', '-q:v', '4', str(temp)],
                               stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, check=True, timeout=30)
                if temp.is_file() and temp.stat().st_size:
                    with _lock:
                        media_id=int(target.name.split('-')[0])
                        if str(target) not in _cancelled and source.is_file() and database.get_media_by_id(media_id):
                            os.replace(temp, target)
                    break
            if not target.is_file():
                raise ValueError('No preview frame')
        except (OSError, ValueError, subprocess.SubprocessError):
            with _lock:
                if len(_failed) >= 256:
                    _failed.pop(next(iter(_failed)))
                _failed[str(target)] = time.monotonic()
        finally:
            try:temp.unlink(missing_ok=True)
            except OSError:pass
            with _lock:
                _pending.discard(str(target))
                _cancelled.discard(str(target))
            _jobs.task_done()


def request_thumbnail(media_id, source):
    global _started
    stat = source.stat()
    fingerprint = hashlib.sha256(f'{source.name}:{stat.st_size}:{stat.st_mtime_ns}'.encode()).hexdigest()[:16]
    target = CACHE / f'{int(media_id)}-{fingerprint}.jpg'
    if target.is_file():
        return target
    name = str(target)
    with _lock:
        if name in _pending or time.monotonic() - _failed.get(name, -1000) < 60:
            return None
        if not _started:
            threading.Thread(target=_worker, name='video-thumbnails', daemon=True).start()
            _started = True
        _pending.add(name)
        try:
            _jobs.put_nowait((source, target))
        except queue.Full:
            _pending.discard(name)
    return None


def remove_thumbnail(media_id):
    with _lock:
        prefix=f'{int(media_id)}-'
        _cancelled.update(name for name in _pending if Path(name).name.startswith(prefix))
        for path in CACHE.glob(prefix+'*.jpg'):
            path.unlink(missing_ok=True)
