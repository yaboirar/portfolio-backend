"""Bounded, separate copies for privacy-enabled public playback and downloads."""
import hashlib
import os
from pathlib import Path
import queue
import shutil
import subprocess
import threading
import time
import database
import media_jobs
import storage_guard

CACHE=Path(__file__).resolve().parent/'uploads/.shared-clean'
_jobs=queue.Queue(maxsize=8)
_lock=threading.Lock()
_pending=set()
_cancelled=set()
_failed={}
_started=False
MAX_CACHE=2*1024**3


def _prune(required):
    CACHE.mkdir(parents=True,exist_ok=True)
    files=sorted((p for p in CACHE.iterdir() if p.is_file() and '.pending.' not in p.name),key=lambda p:p.stat().st_mtime)
    total=sum(p.stat().st_size for p in files)
    for path in files:
        if total+required<=MAX_CACHE:break
        if time.time()-path.stat().st_mtime<60:continue
        size=path.stat().st_size;path.unlink(missing_ok=True);total-=size
    if total+required>MAX_CACHE or storage_guard.stats()['available_bytes']<required:
        raise ValueError('Not enough safe storage for a cleaned copy')


def _worker():
    while True:
        item,source,target=_jobs.get();temp=target.with_name(target.stem+'.pending'+target.suffix)
        try:
            _prune(source.stat().st_size*2)
            with _lock:
                if str(target) in _cancelled:continue
            if item['media_type']=='video':
                command=['ffmpeg','-nostdin','-v','error','-protocol_whitelist','file','-i',str(source),'-map','0:V:0','-map','0:a?','-map_metadata','-1','-map_metadata:s','-1','-map_chapters','-1','-c','copy','-fflags','+bitexact','-metadata','encoder=','-metadata:s:v','encoder=','-metadata:s:a','encoder=']
                if source.suffix.lower()=='.mp4':command+=['-movflags','+faststart']
                command+=['-y',str(temp)]
            else:
                # Keep only orientation, which is needed to display the pixels correctly.
                command=['exiftool','-all=','-tagsfromfile','@','-Orientation','-o',str(temp),str(source)]
            media_jobs.run(command,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=45,check=True)
            if not temp.is_file() or not temp.stat().st_size:raise ValueError('No cleaned output')
            with _lock:
                if str(target) not in _cancelled and source.is_file() and database.get_media_by_id(item['id']):
                    os.replace(temp,target)
        except (OSError,ValueError,subprocess.SubprocessError):
            with _lock:
                if len(_failed)>=128:_failed.pop(next(iter(_failed)))
                _failed[str(target)]=time.monotonic()
        finally:
            try:temp.unlink(missing_ok=True)
            except OSError:pass
            with _lock:_pending.discard(str(target));_cancelled.discard(str(target))
            _jobs.task_done()


def request(item,source):
    global _started
    info=source.stat()
    fingerprint=hashlib.sha256(f'privacy-v1:{source.name}:{info.st_size}:{info.st_mtime_ns}'.encode()).hexdigest()[:24]
    target=CACHE/f"{item['id']}-{fingerprint}{source.suffix.lower()}"
    with _lock:
        if target.is_file():return 'ready',target
        if str(target) in _failed and time.monotonic()-_failed[str(target)]<60:return 'failed',None
        if str(target) in _pending:return 'pending',None
        if not _started:
            threading.Thread(target=_worker,name='clean-shared-copies',daemon=True).start();_started=True
        _pending.add(str(target))
        try:_jobs.put_nowait((dict(item),source,target))
        except queue.Full:_pending.discard(str(target));return 'busy',None
    return 'pending',None


def remove(media_id):
    prefix=f'{int(media_id)}-'
    with _lock:
        _cancelled.update(name for name in _pending if Path(name).name.startswith(prefix))
        for path in CACHE.glob(prefix+'*'):path.unlink(missing_ok=True)


def cleanup_temporary():
    CACHE.mkdir(parents=True,exist_ok=True)
    for path in CACHE.glob('*.pending.*'):path.unlink(missing_ok=True)
