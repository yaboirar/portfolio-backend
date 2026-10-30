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
        subprocess.run(['ffmpeg','-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=320x180:d=1','-c:v','libx264','-pix_fmt','yuv420p','-an','-metadata','artist=Private Test Author','-metadata','creation_time=2020-01-02T03:04:05Z','-metadata','comment=Private Editing Test','-y',str(fixture)],check=True,timeout=20)
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
        # Existing test URLs are retired exactly once when the new setting is added.
        with database.get_db() as conn:
            conn.execute('ALTER TABLE media_shares DROP COLUMN allow_details')
            conn.execute('INSERT INTO media_shares (media_id,token_hash,created_at,expires_at) VALUES (?,?,?,?)',(video['id'],'legacy-test-hash',1,None))
        database.init_db()
        assert database.list_media_shares()==[]
        code,shared=request('POST',share_url,{'expires_in':86400})
        assert code==201 and len(shared['path'].split('/')[-1])==32
        public=shared['path']
        assert public.startswith('/share/')
        database.init_db()
        assert database.get_media_share(video['id']) is not None
        assert request('GET',public.replace('/share/','/videoshared/'),authenticated=False)[0]==404
        assert request('GET',public,authenticated=False,binary=True)[0]==200
        metadata=request('GET',public+'/metadata',authenticated=False)[1]
        assert metadata['details_enabled'] is False and set(metadata)=={'title','description','kind','details_enabled'}
        assert request('GET',public+'/download',authenticated=False)[0]==404
        assert request('GET','/api/shares',authenticated=False)[0]==401
        shares=request('GET','/api/shares')[1]['shares']
        assert shares[0]['media_id']==video['id'] and 'token_hash' not in shares[0]
        previous=public
        public=request('POST',share_url,{'expires_in':86400,'allow_details':True})[1]['path']
        assert request('GET',previous+'/file',authenticated=False)[0]==404
        metadata=request('GET',public+'/metadata',authenticated=False)[1]
        assert set(metadata)=={'title','description','kind','details_enabled','details'}
        assert set(metadata['details'])=={'title','type','duration','dimensions'}
        assert metadata['details']['duration']=='0:01' and metadata['details']['dimensions']=='320 × 180'
        c=http.client.HTTPConnection('127.0.0.1',port);c.request('GET',public+'/download');r=c.getresponse()
        assert r.status==200 and r.getheader('Content-Disposition')=='attachment; filename="file.mp4"' and r.read()==original_bytes;c.close()
        assert request('POST',share_url,{'allow_details':'yes'})[0]==400
        for asset in ['/favicon.png','/favicon.ico']:
            assert request('GET',asset,authenticated=False,binary=True)[0]==200
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
        # Every supported file type shares independently, with a minimal public response.
        import clean_downloads
        image=request('POST','/api/upload/raw?filename=privacy.png',image_bytes,'image/png')[1]
        image_route='/api/media/'+str(image['id'])+'/share'
        assert request('POST',image_route,{'strip_metadata':True})[0]==400
        clean_image=request('POST',image_route,{'allow_details':True,'strip_metadata':True})[1]['path']
        def ready(path):
            for attempt in range(150):
                status,body=request('GET',path+'/metadata',authenticated=False)
                if status==200:return body
                assert status==202,(status,body)
                time.sleep(.1)
            raise AssertionError('Privacy copy did not finish')
        public_image=ready(clean_image)
        assert public_image['kind']=='image' and set(public_image['details'])=={'title','type','dimensions'}
        stripped_image=request('GET',clean_image+'/file',authenticated=False,binary=True)[1]
        with Image.open(io.BytesIO(stripped_image)) as clean:
            assert 'Comment' not in clean.info and clean.size==(32,24)
        image_original=server.IMAGES_DIR/image['filename']
        assert image_original.read_bytes()==image_bytes
        clean_image_path=clean_downloads.request(image,image_original)[1]
        assert clean_image_path.is_file()
        assert request('DELETE','/api/media/'+str(image['id']))[0]==200
        assert not clean_image_path.exists() and request('GET',clean_image+'/file',authenticated=False)[0]==404
        clean_video=request('POST',share_url,{'allow_details':True,'strip_metadata':True})[1]['path']
        assert ready(clean_video)['kind']=='video'
        cleaned_path=clean_downloads.request(video,original)[1]
        probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format_tags:stream_tags','-of','json',str(cleaned_path)]))
        assert 'Private Test Author' not in json.dumps(probe) and 'Private Editing Test' not in json.dumps(probe) and '2020-01-02' not in json.dumps(probe)
        def packets(path):return subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-map','0:v:0','-c','copy','-f','hash','-hash','sha256','-'])
        assert packets(original)==packets(cleaned_path)
        previous_request=clean_downloads.request
        clean_downloads.request=lambda *args:('failed',None)
        try:assert request('GET',clean_video+'/file',authenticated=False)[0]==503
        finally:clean_downloads.request=previous_request
        public=clean_video
        shared_poem=request('POST','/api/poems',{'title':'Shared poem','content':'<script>plain text only</script>\nA line.'})[1]
        poem_route='/api/poems/'+str(shared_poem['id'])+'/share'
        assert request('POST',poem_route,{},authenticated=False)[0]==401
        poem_link=request('POST',poem_route,{'allow_details':True,'strip_metadata':True})[1]['path']
        poem_meta=request('GET',poem_link+'/metadata',authenticated=False)[1]
        assert poem_meta['kind']=='poem' and set(poem_meta['details'])=={'title','type'}
        assert request('GET',poem_link+'/file',authenticated=False,binary=True)[1]==shared_poem['content'].encode()
        assert any(item['item_kind']=='poem' for item in request('GET','/api/shares')[1]['shares'])
        assert request('DELETE','/api/poems/'+str(shared_poem['id']))[0]==200
        assert request('GET',poem_link+'/metadata',authenticated=False)[0]==404
        tagged=Path(temp)/'tagged.jpg'
        Image.new('RGB',(32,24),(30,70,90)).save(tagged)
        subprocess.run(['exiftool','-overwrite_original','-Artist=Private Author','-Software=Private Editor','-DateTimeOriginal=2020:01:02 03:04:05','-GPSLatitude=1.2','-GPSLatitudeRef=N','-GPSLongitude=2.3','-GPSLongitudeRef=E',str(tagged)],stdout=subprocess.DEVNULL,check=True)
        tagged_bytes=tagged.read_bytes()
        jpeg=request('POST','/api/upload/raw?filename=tagged.jpg',tagged_bytes,'image/jpeg')[1]
        jpeg_link=request('POST','/api/media/'+str(jpeg['id'])+'/share',{'allow_details':True,'strip_metadata':True})[1]['path']
        ready(jpeg_link)
        clean_jpeg=clean_downloads.request(jpeg,server.IMAGES_DIR/jpeg['filename'])[1]
        tags=json.loads(subprocess.check_output(['exiftool','-json','-GPS:all','-Artist','-Software','-DateTimeOriginal',str(clean_jpeg)]))[0]
        assert set(tags)=={'SourceFile'},tags
        assert (server.IMAGES_DIR/jpeg['filename']).read_bytes()==tagged_bytes
        assert request('DELETE','/api/media/'+str(jpeg['id']))[0]==200 and not clean_jpeg.exists()
        print('PASS: synthetic JPEG GPS, author, editing software, and capture date removed; original bytes retained.')
        print('PASS: image/poem sharing, privacy tags stripped, identical video packet hash, originals intact, privacy failure closed, and cleaned derivatives removed.')
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
