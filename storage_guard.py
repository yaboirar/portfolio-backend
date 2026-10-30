"""Disk headroom and upload admission for a small private VPS."""
from functools import wraps
import os
from pathlib import Path
import shutil
import threading

ROOT = Path(__file__).resolve().parent
RESERVE_BYTES = max(1024**3, int(os.environ.get('STORAGE_RESERVE_BYTES', 10*1024**3)))
UPLOAD_SLOTS = threading.BoundedSemaphore(1)


def stats():
    usage = shutil.disk_usage(ROOT)
    reserve = min(RESERVE_BYTES, usage.total)
    capacity = max(0, usage.total-reserve)
    available = max(0, usage.free-reserve)
    used = max(0, capacity-available)
    return {'total_bytes': usage.total, 'used_bytes': used, 'capacity_bytes': capacity,
            'free_bytes': usage.free, 'available_bytes': available, 'reserved_bytes': reserve,
            'used_percent': round(min(100, used/capacity*100),1) if capacity else 100,
            'uploads_available': available > 0}


def admit_upload(method):
    @wraps(method)
    def guarded(handler, *args, **kwargs):
        try:
            amount = int(handler.headers.get('Content-Length','0'))
        except ValueError:
            handler.send_error_json(400,'Invalid request length')
            return
        if amount <= 0:
            handler.send_error_json(411,'Content-Length is required')
            return
        if amount > 550*1024**2:
            handler.send_error_json(413,'Upload exceeds the request size limit')
            return
        if not UPLOAD_SLOTS.acquire(blocking=False):
            handler.send_json(429,{'message':'Another upload is finishing. Please retry shortly.'},{'Retry-After':'3'})
            return
        try:
            # Images briefly occupy their input and output paths during verification.
            if amount*2 > stats()['available_bytes']:
                handler.send_error_json(507,'Upload would consume the disk space reserved for the service')
                return
            return method(handler,*args,**kwargs)
        finally:
            UPLOAD_SLOTS.release()
    return guarded
