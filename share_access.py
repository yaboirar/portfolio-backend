"""Narrow, revocable public access to an explicitly shared video."""
import os
from pathlib import Path
import re
import threading
import database

ROOT=Path(__file__).resolve().parent
STREAMS=threading.BoundedSemaphore(4)
DAILY_BYTES=max(1024**2,int(os.environ.get('SHARE_DAILY_LIMIT_BYTES',10*1024**3)))


class Budget:
    def __init__(self,handler):self.handler=handler;self.day=None;self.reserved=0
    def reserve(self,amount):
        self.day=database.reserve_share_bytes(amount,DAILY_BYTES)
        if self.day is None:
            self.handler.send_json(429,{'message':'The shared-video transfer allowance is exhausted. Try again tomorrow.'},{'Retry-After':'3600'})
            return False
        self.reserved=amount;return True
    def finish(self,sent):
        if self.day:database.refund_share_bytes(self.day,max(0,self.reserved-sent))


def handle_get(handler,path,head_only=False):
    assets={'/shared-assets/shared.js':'shared.js','/shared-assets/shared.css':'shared.css','/shared-assets/video-player.js':'video-player.js'}
    if path in assets:
        handler.serve_file_with_range(ROOT/'static'/assets[path],head_only=head_only);return True
    match=re.fullmatch(r'/videoshared/([A-Za-z0-9_-]{32})(?:/(metadata|file))?',path)
    if not match:return False
    item=database.resolve_media_share(match.group(1))
    if not item:
        handler.send_error_json(404,'This shared link is unavailable');return True
    filename=item['filename']
    base=(ROOT/'uploads/videos').resolve()
    original=(base/filename).resolve()
    if Path(filename).name!=filename or not original.is_relative_to(base) or not original.is_file():
        handler.send_error_json(404,'This shared link is unavailable');return True
    action=match.group(2)
    if action=='metadata':
        handler.send_json(200,{'title':item['title'],'description':item.get('description',''),'duration_seconds':item.get('duration_seconds'),'file_size':original.stat().st_size,'mime_type':item['mime_type']})
    elif action=='file':
        if not STREAMS.acquire(blocking=False):
            handler.send_json(429,{'message':'All shared-video streams are busy. Please retry shortly.'},{'Retry-After':'5'});return True
        try:handler.serve_file_with_range(original,head_only=head_only,budget=Budget(handler))
        finally:STREAMS.release()
    else:handler.serve_file_with_range(ROOT/'static/shared.html',head_only=head_only)
    return True


def handle_owner(handler,path):
    match=re.fullmatch(r'/api/media/(\d+)/share',path)
    if not match:return False
    if not handler.require_auth():return True
    media_id=int(match.group(1))
    item=database.get_media_by_id(media_id)
    if not item or item['media_type']!='video':handler.send_error_json(404,'Video not found');return True
    if handler.command=='GET':
        share=database.get_media_share(media_id);handler.send_json(200,{'shared':share is not None,'share':share,'daily_transfer_limit_bytes':DAILY_BYTES});return True
    if handler.command=='DELETE':
        database.revoke_media_share(media_id);handler.send_json(200,{'shared':False});return True
    if handler.command=='POST':
        try:
            body=handler.parse_json_body()
            if not isinstance(body,dict):raise ValueError('Invalid share settings')
            result=database.create_media_share(media_id,body.get('expires_in',604800))
            result['path']='/videoshared/'+result.pop('token')
            handler.send_json(201,result)
        except (ValueError,TypeError) as error:handler.send_error_json(400,str(error))
        return True
    handler.send_error_json(405,'Method not allowed');return True
