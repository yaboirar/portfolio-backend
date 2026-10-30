"""Opt-in, revocable access to one image, video or poem, never the library."""
import os
from pathlib import Path
import re
import threading
import database
import clean_downloads
import folder_sharing
import video_thumbnails
import urllib.parse
ROOT=Path(__file__).resolve().parent
STREAMS=threading.BoundedSemaphore(4)
DAILY_BYTES=max(1024**2,int(os.environ.get('SHARE_DAILY_LIMIT_BYTES',10*1024**3)))

class Budget:
    def __init__(self,handler):self.handler=handler;self.day=None;self.reserved=0
    def reserve(self,amount):
        self.day=database.reserve_share_bytes(amount,DAILY_BYTES)
        if self.day is None:
            self.handler.send_json(429,{'message':'The shared-file transfer allowance is exhausted. Try again tomorrow.'},{'Retry-After':'3600'});return False
        self.reserved=amount;return True
    def finish(self,sent):
        if self.day:database.refund_share_bytes(self.day,max(0,self.reserved-sent))

def _source(handler,item):
    if item['media_type']=='poem':return True
    filename=item['filename'];base=(ROOT/'uploads'/('videos' if item['media_type']=='video' else 'images' if item['media_type']=='image' else 'documents')).resolve();original=(base/filename).resolve()
    if Path(filename).name!=filename or not original.is_relative_to(base) or not original.is_file():
        handler.send_error_json(404,'This shared link is unavailable');return None
    if item['strip_metadata'] and item['media_type']=='other':
        handler.send_error_json(503,'Metadata removal is unavailable for this document.');return None
    if item['strip_metadata']:
        state,clean=clean_downloads.request(item,original)
        if state!='ready':
            handler.send_json(503 if state=='failed' else 429 if state=='busy' else 202,{'preparing':state=='pending','message':'The privacy copy could not be prepared. Retry shortly.' if state=='failed' else 'Preparing a copy with embedded metadata removed…'},{'Retry-After':'2'});return None
        return clean
    return original

def handle_get(handler,path,head_only=False):
    if path in ('/favicon.ico','/favicon.png'):
        handler.serve_file_with_range(ROOT/'static/favicon.png',head_only=head_only);return True
    assets={'/shared-assets/shared.js':'shared.js','/shared-assets/shared.css':'shared.css','/shared-assets/video-player.js':'video-player.js'}
    if path in assets:
        handler.serve_file_with_range(ROOT/'static'/assets[path],head_only=head_only);return True
    match=re.fullmatch(r'/share/([A-Za-z0-9_-]{32})(?:/item/([A-Za-z0-9_-]{16}))?(?:/(metadata|file|download|thumbnail))?',path)
    if not match:return False
    token,child_key,action=match.group(1),match.group(2),match.group(3)
    grant=folder_sharing.resolve(token)
    item=database.resolve_media_share(token) if not child_key else None
    if grant and not child_key:
        if action is None:handler.serve_file_with_range(ROOT/'static/shared.html',head_only=head_only)
        elif action=='metadata':
            query=urllib.parse.parse_qs(urllib.parse.urlsplit(handler.path).query)
            try:page_number=int(query.get('page',['1'])[0])
            except ValueError:page_number=1
            items,more=folder_sharing.page(grant,page_number)
            result={'kind':'folder','title':grant['title'],'description':grant['description'],'details_enabled':bool(grant['allow_details']),'items':items,'more':more,'page':page_number}
            if grant['allow_details']:result['details']={'title':grant['title'],'type':'Folder'}
            handler.send_json(200,result)
        else:handler.send_error_json(404,'This shared link is unavailable')
        return True
    if grant and child_key:item=folder_sharing.child(grant,child_key)
    if not item:handler.send_error_json(404,'This shared link is unavailable');return True
    if action=='download' and not item['allow_details']:
        handler.send_error_json(404,'Download is unavailable');return True
    if action is None:
        handler.serve_file_with_range(ROOT/'static/shared.html',head_only=head_only);return True
    if action=='thumbnail':
        if item['media_type'] not in ('image','video'):handler.send_error_json(404,'Preview unavailable');return True
        # The derived JPEG contains no source tags; originals are never returned here.
        original=_source(handler,{**item,'strip_metadata':False})
        if original is None:return True
        preview=video_thumbnails.request_thumbnail(item['id'],original)
        if not preview:handler.send_json(202,{'preparing':True},{'Retry-After':'2'});return True
        if not STREAMS.acquire(blocking=False):handler.send_json(429,{'message':'Preview busy'},{'Retry-After':'2'});return True
        try:handler.serve_file_with_range(preview,head_only=head_only,budget=Budget(handler))
        finally:STREAMS.release()
        return True
    source=_source(handler,item)
    if source is None:return True
    kind='document' if item['media_type']=='other' else item['media_type']
    if action=='metadata':
        result={'title':item['title'],'description':item.get('description',''),'kind':kind,'details_enabled':bool(item['allow_details'])}
        if grant:result.update(folder_path='/share/'+token,folder_title=grant['title'])
        if kind=='document':result['text_preview']=Path(item['filename']).suffix.lower() in {'.txt','.md','.csv','.json','.log','.yaml','.yml','.xml'}
        if item['allow_details']:
            details={'title':item['title'],'type':item.get('mime_type') or 'text/plain'}
            if kind=='video':
                total=max(0,int(item.get('duration_seconds') or 0));hours,remainder=divmod(total,3600);minutes,seconds=divmod(remainder,60)
                details['duration']=f'{hours}:{minutes:02}:{seconds:02}' if hours else f'{minutes}:{seconds:02}'
            if kind in ('video','image'):details['dimensions']=f"{item['width']} × {item['height']}" if item.get('width') and item.get('height') else 'Unavailable'
            result['details']=details
        handler.send_json(200,result);return True
    if not STREAMS.acquire(blocking=False):
        handler.send_json(429,{'message':'All shared-file transfers are busy. Please retry shortly.'},{'Retry-After':'5'});return True
    try:
        budget=Budget(handler)
        if kind=='poem':
            body=item['content'].encode('utf-8')
            if not head_only and not budget.reserve(len(body)):return True
            handler.send_response(200);handler.send_cors_headers();handler.send_header('Content-Type','text/plain; charset=utf-8');handler.send_header('Content-Length',str(len(body)));handler.send_header('Cache-Control','private, no-store')
            if action=='download':handler.send_header('Content-Disposition','attachment; filename="poem.txt"')
            handler.end_headers()
            if not head_only:
                try:handler.wfile.write(body)
                except OSError:handler.close_connection=True
        else:handler.serve_file_with_range(source,head_only=head_only,budget=budget,attachment_name='file'+source.suffix.lower() if action=='download' else None)
    finally:STREAMS.release()
    return True

def handle_owner(handler,path):
    folder_match=re.fullmatch(r'/api/folders/(\d+)/share',path)
    if folder_match:
        if not handler.require_auth():return True
        folder_id=int(folder_match.group(1))
        try:
            if handler.command=='GET':handler.send_json(200,folder_sharing.owner_status(folder_id))
            elif handler.command=='POST':
                body=handler.parse_json_body()
                if not isinstance(body,dict):raise ValueError('Invalid sharing options')
                handler.send_json(201,folder_sharing.create(folder_id,body))
            elif handler.command=='DELETE':folder_sharing.revoke(folder_id);handler.send_json(200,{'shared':False})
            else:handler.send_error_json(405,'Method not allowed')
        except (ValueError,TypeError) as error:handler.send_error_json(400,str(error))
        return True
    match=re.fullmatch(r'/api/(media|poems)/(\d+)/share',path)
    if not match:return False
    if not handler.require_auth():return True
    kind='poem' if match.group(1)=='poems' else 'media';item_id=int(match.group(2))
    item=database.get_poem_by_id(item_id) if kind=='poem' else database.get_media_by_id(item_id)
    if not item:handler.send_error_json(404,'File not found');return True
    if handler.command=='GET':
        share=database.get_media_share(item_id,kind);handler.send_json(200,{'shared':share is not None,'share':share,'daily_transfer_limit_bytes':DAILY_BYTES});return True
    if handler.command=='DELETE':
        database.revoke_media_share(item_id,kind);handler.send_json(200,{'shared':False});return True
    if handler.command=='POST':
        try:
            body=handler.parse_json_body()
            if not isinstance(body,dict):raise ValueError('Invalid share settings')
            if item.get('media_type')=='other' and body.get('strip_metadata'):
                raise ValueError('Embedded metadata removal is available for images and videos only')
            result=database.create_media_share(item_id,body.get('expires_in',604800),body.get('allow_details',False),kind,body.get('strip_metadata',False))
            result['path']='/share/'+result.pop('token');handler.send_json(201,result)
        except (ValueError,TypeError) as error:handler.send_error_json(400,str(error))
        return True
    handler.send_error_json(405,'Method not allowed');return True
