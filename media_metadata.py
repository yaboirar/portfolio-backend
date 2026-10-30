"""Persist technical metadata without rewriting media or probing in a list request."""
import json
import math
from pathlib import Path
import queue
import subprocess
import tempfile
import threading
import time
from PIL import Image
import database
import media_jobs

_queue = queue.Queue(maxsize=64)
_pending = set()
_failed = {}
_lock = threading.Lock()
_started = False


def inspect_video(path):
    command=['ffprobe','-v','error','-protocol_whitelist','file','-max_alloc','67108864',
             '-show_entries','format=duration:stream=codec_type,width,height,duration','-of','json',str(path)]
    with tempfile.TemporaryFile() as output:
        result=media_jobs.run(command,stdout=output,stderr=subprocess.DEVNULL,timeout=15,check=True)
        output.seek(0); raw=output.read(1024*1024+1)
    if len(raw)>1024*1024:raise ValueError('Metadata exceeds limit')
    info=json.loads(raw)
    track=next(stream for stream in info.get('streams',[]) if stream.get('codec_type')=='video' and stream.get('width') and stream.get('height'))
    duration=float(info.get('format',{}).get('duration') or track.get('duration') or 0)
    return {'width':int(track['width']),'height':int(track['height']),
            'duration_seconds':duration if math.isfinite(duration) and duration>0 else None}


def _worker():
    while True:
        item,source=_queue.get()
        try:
            if not database.get_media_by_id(item['id']):continue
            if item['media_type']=='video':values=inspect_video(source)
            else:
                formats={'.jpg':'JPEG','.jpeg':'JPEG','.png':'PNG','.webp':'WEBP'}
                with Image.open(source,formats=[formats[source.suffix.lower()]]) as image:
                    values={'width':image.width,'height':image.height,'duration_seconds':None}
            database.save_media_metadata(item['id'],values)
        except (OSError,ValueError,KeyError,StopIteration,subprocess.SubprocessError):
            with _lock:
                if len(_failed)>=256:_failed.pop(next(iter(_failed)))
                _failed[item['id']]=time.monotonic()
        finally:
            with _lock:_pending.discard(item['id'])
            _queue.task_done()


def schedule(item,source):
    global _started
    if not source.is_file() or (item.get('width') and (item['media_type']!='video' or item.get('duration_seconds'))):return
    with _lock:
        if item['id'] in _pending or time.monotonic()-_failed.get(item['id'],-1000)<60:return
        if not _started:
            threading.Thread(target=_worker,name='media-metadata',daemon=True).start();_started=True
        _pending.add(item['id'])
        try:_queue.put_nowait((item,source))
        except queue.Full:_pending.discard(item['id'])
