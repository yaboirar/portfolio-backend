"""Folder integration checks against a disposable local HTTP server and database."""
import http.client
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import subprocess
import time
from PIL import Image, PngImagePlugin
import database
import auth
import server

with tempfile.TemporaryDirectory() as temp:
    database.DB_PATH = str(Path(temp) / 'test.db')
    os.environ['PUBLIC_ORIGIN'] = 'http://127.0.0.1:8080'
    database.init_db()
    auth.init_auth()
    auth.set_admin_password('folder_test', 'DisposableTestsOnly_1234!')
    with database.get_db() as conn:
        admin_id = conn.execute('SELECT id FROM admins').fetchone()[0]
    token = auth.create_session(admin_id)
    httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), server.PortfolioHandler)
    port = httpd.server_address[1]
    os.environ['PUBLIC_ORIGIN'] = f'http://127.0.0.1:{port}'
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    def request(method, path, payload=None, content_type='application/json', authenticated=True, binary=False):
        headers = {'Origin': os.environ['PUBLIC_ORIGIN'], 'X-Requested-With': 'portfolio-admin', 'Content-Type': content_type}
        if authenticated:
            headers.update({'Cookie': 'admin_session_local=' + token, 'X-CSRF-Token': auth.csrf_for(token)})
        raw = payload if isinstance(payload, bytes) else json.dumps(payload).encode() if payload is not None else None
        conn = http.client.HTTPConnection('127.0.0.1', port, timeout=15)
        try:
            conn.request(method, path, raw, headers)
            response = conn.getresponse()
            data=response.read()
            return response.status, data if binary else json.loads(data)
        finally:
            conn.close()
    try:
        code, folder = request('POST', '/api/folders', {'name':'First','tag':'Travel','description':'Selected memories','color':'#69a5ef'})
        assert code == 201 and folder['tag']=='Travel' and folder['description']=='Selected memories' and folder['color']=='#69a5ef'
        assert request('POST','/api/folders',{'name':'Bad color','color':'red;display:none'})[0]==400
        code, second = request('POST', '/api/folders', {'name': 'Second'})
        assert code == 201
        assert request('POST', '/api/folders', {'name': 'first'})[0] == 400
        png = io.BytesIO()
        info = PngImagePlugin.PngInfo(); info.add_text('Comment', 'Original metadata retained')
        Image.new('RGB', (32, 24), (60, 80, 100)).save(png, format='PNG', pnginfo=info)
        image_bytes = png.getvalue()
        boundary = 'FolderPipelineBoundary'
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="folder_id"\r\n\r\n{folder["id"]}\r\n'
                f'--{boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nFolder image\r\n'
                f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="folder.png"\r\nContent-Type: image/png\r\n\r\n').encode() + image_bytes + f'\r\n--{boundary}--\r\n'.encode()
        code, multipart = request('POST', '/api/upload', body, 'multipart/form-data; boundary=' + boundary)
        assert code == 201 and multipart['folder_id'] == folder['id'], multipart
        code, raw = request('POST', f'/api/upload/raw?filename=raw.png&folder_id={folder["id"]}', image_bytes, 'image/png')
        assert code == 201 and raw['folder_id'] == folder['id'], raw
        code, root = request('POST', '/api/upload/raw?filename=root.png', image_bytes, 'image/png')
        assert code == 201 and root['folder_id'] is None, root
        for item in (multipart, raw, root):
            path = server.UPLOADS_DIR / item['relative_url'].removeprefix('/uploads/')
            assert path.read_bytes() == image_bytes
        code, poem = request('POST', '/api/poems', {'title':'Folder poem','content':'A line.','folder_id':folder['id']})
        assert code == 201 and poem['folder_id'] == folder['id']
        payload = {'folder_id':second['id'],'items':[{'kind':'media','id':multipart['id']},{'kind':'media','id':raw['id']},{'kind':'poem','id':poem['id']}]}
        assert request('POST', '/api/folders/move', payload, authenticated=False)[0] == 401
        code, moved = request('POST', '/api/folders/move', payload)
        assert code == 200 and moved['moved'] == 3
        assert database.get_media_by_id(multipart['id'])['folder_id'] == second['id']
        assert database.get_poem_by_id(poem['id'])['folder_id'] == second['id']
        bad = {'folder_id':None,'items':[{'kind':'media','id':multipart['id']},{'kind':'media','id':999999}]}
        assert request('POST', '/api/folders/move', bad)[0] == 400
        assert database.get_media_by_id(multipart['id'])['folder_id'] == second['id']
        assert request('PATCH', f'/api/folders/{second["id"]}', {'name':'Renamed','tag':'Edited','description':'New description','color':'#67ba98'})[0] == 200
        assert request('PATCH', f'/api/folders/{second["id"]}', {'name':'Renamed again'})[1]['color']=='#67ba98'
        database.init_db()
        assert database.get_media_by_id(multipart['id'])['folder_id'] == second['id']
        assert request('DELETE', f'/api/folders/{second["id"]}')[0] == 200
        assert database.get_media_by_id(multipart['id'])['folder_id'] is None
        assert database.get_poem_by_id(poem['id'])['folder_id'] is None
        for item in (multipart,raw,root):
            assert request('DELETE', '/api/media/' + str(item['id']))[0] == 200

        fixture=Path(temp)/'video.mp4'
        subprocess.run(['ffmpeg','-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=320x180:d=1','-c:v','libx264','-pix_fmt','yuv420p','-an','-y',str(fixture)],check=True,timeout=20)
        original_bytes=fixture.read_bytes()
        code,video=request('POST','/api/upload/raw?filename=thumbnail.mp4',original_bytes,'video/mp4')
        assert code==201,video
        url=f'/api/media/{video["id"]}/thumbnail'
        assert request('GET',url,authenticated=False,binary=True)[0]==401
        code,data=request('GET',url,binary=True)
        assert code in (200,202)
        for attempt in range(30):
            if code==200:break
            time.sleep(.2)
            code,data=request('GET',url,binary=True)
        assert code==200 and data[:2]==b'\xff\xd8'
        thumb=Image.open(io.BytesIO(data))
        assert thumb.width<=384 and thumb.height<=216
        original=server.UPLOADS_DIR/video['relative_url'].removeprefix('/uploads/')
        assert original.read_bytes()==original_bytes
        assert video['duration_seconds'] > 0 and video['width']==320 and video['height']==180
        assert request('GET','/api/storage',authenticated=False)[0]==401
        usage=request('GET','/api/storage')[1]
        assert usage['reserved_bytes']==10*1024**3 and 0 <= usage['used_percent'] <= 100
        share_url='/api/media/'+str(video['id'])+'/share'
        assert request('POST',share_url,{},authenticated=False)[0]==401
        assert request('POST',share_url,{'expires_in':12})[0]==400
        code,shared=request('POST',share_url,{'expires_in':86400})
        assert code==201 and len(shared['path'].split('/')[-1])==32
        public=shared['path']
        assert request('GET',public,authenticated=False,binary=True)[0]==200
        assert request('GET',public+'/metadata',authenticated=False)[1]['duration_seconds']>0
        assert request('GET',public+'/file',authenticated=False,binary=True)[1]==original_bytes
        assert request('GET','/api/media/'+str(video['id']),authenticated=False)[0]==401
        with database.get_db() as conn:
            row=conn.execute('SELECT token_hash FROM media_shares').fetchone()
            assert row[0]!=public.split('/')[-1] and len(row[0])==64
        c=http.client.HTTPConnection('127.0.0.1',port)
        c.request('GET',public+'/file',headers={'Range':'bytes=0-15'})
        r=c.getresponse(); assert r.status==206 and r.read()==original_bytes[:16];c.close()
        assert request('DELETE',share_url)[0]==200
        assert request('GET',public+'/file',authenticated=False)[0]==404
        public=request('POST',share_url,{'expires_in':86400})[1]['path']
        with database.get_db() as conn:conn.execute('UPDATE media_shares SET expires_at=1')
        assert request('GET',public+'/metadata',authenticated=False)[0]==404
        public=request('POST',share_url,{'expires_in':86400})[1]['path']
        import share_access, storage_guard
        previous=share_access.DAILY_BYTES;share_access.DAILY_BYTES=1
        assert request('GET',public+'/file',authenticated=False)[0]==429
        share_access.DAILY_BYTES=previous
        previous_stats=storage_guard.stats
        storage_guard.stats=lambda:{'available_bytes':0}
        assert request('POST','/api/upload/raw?filename=low.png',image_bytes,'image/png')[0]==507
        storage_guard.stats=previous_stats
        storage_guard.UPLOAD_SLOTS.acquire()
        try:assert request('POST','/api/upload/raw?filename=busy.png',image_bytes,'image/png')[0]==429
        finally:storage_guard.UPLOAD_SLOTS.release()
        derived=server.VIDEOS_DIR/Path(video['filename']).stem
        derived.mkdir();(derived/'old.ts').write_bytes(b'old derivative')
        assert request('DELETE','/api/media/'+str(video['id']))[0]==200
        assert not derived.exists() and not original.exists()
        assert request('GET',public+'/file',authenticated=False)[0]==404
        print('PASS: duration, dimensions, storage admission, random hash-only sharing, anonymous ranges, revocation, expiry, egress budget, and derivative deletion.')
        assert request('GET',url,binary=True)[0]==404

        assert request('GET','/api/notifications',authenticated=False)[0]==401
        code,first=request('POST','/api/notifications',{'title':'Upload complete','message':'1 file uploaded.','level':'success'})
        assert code==201
        code,second_notice=request('POST','/api/notifications',{'title':'Files moved','message':'2 files moved.','level':'success'})
        assert code==201
        assert request('GET','/api/notifications')[1]['unread_count']==2
        code,notices=request('POST','/api/notifications/read',{'through_id':first['id']})
        assert code==200 and notices['unread_count']==1
        assert request('POST','/api/notifications/read',{'through_id':second_notice['id']})[1]['unread_count']==0
        third=request('POST','/api/notifications',{'title':'Third','message':'First unread'})[1]
        fourth=request('POST','/api/notifications',{'title':'Fourth','message':'Second unread'})[1]
        code,single_read=request('POST','/api/notifications/read',{'id':fourth['id']})
        assert code==200 and single_read['unread_count']==1
        assert next(item for item in single_read['notifications'] if item['id']==third['id'])['is_read']==0
        assert request('POST','/api/notifications',{'title':'Invalid','message':'x','level':'script'})[0]==400
        for i in range(105):database.create_notification('Batch complete',str(i))
        assert len(database.get_notifications()['notifications'])==100
        print('PASS: private notification history, unread counts, mark-all snapshot, validation, and bounded retention.')
        print('PASS: folder fields/validation/partial edits, original preservation, private cached video thumbnails, and deletion cleanup.')
        print('PASS: folder CRUD, authenticated/atomic moves, upload destinations, migration, byte preservation, and safe folder deletion.')
    finally:
        httpd.shutdown()
        httpd.server_close()
