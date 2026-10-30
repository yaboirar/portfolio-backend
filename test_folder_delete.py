"""Folder deletion choices against disposable data only."""
import http.client,json,os,tempfile,threading
from pathlib import Path
import database,auth,server,video_thumbnails,clean_downloads,media_storage

with tempfile.TemporaryDirectory() as temp:
    root=Path(temp);database.DB_PATH=str(root/'test.db')
    server.UPLOADS_DIR=root/'uploads';server.VIDEOS_DIR=server.UPLOADS_DIR/'videos';server.VIDEOS_DIR.mkdir(parents=True)
    video_thumbnails.CACHE=server.UPLOADS_DIR/'.thumbnails';video_thumbnails.CACHE.mkdir()
    clean_downloads.CACHE=server.UPLOADS_DIR/'.shared-clean';clean_downloads.CACHE.mkdir()
    os.environ['PUBLIC_ORIGIN']='http://127.0.0.1'
    database.init_db();auth.init_auth();auth.set_admin_password('folder_choice_test','DisposableFolderTests_2026!')
    with database.get_db() as conn:admin_id=conn.execute('SELECT id FROM admins').fetchone()[0]
    token=auth.create_session(admin_id)
    httpd=server.ThreadingHTTPServer(('127.0.0.1',0),server.PortfolioHandler)
    port=httpd.server_address[1];os.environ['PUBLIC_ORIGIN']=f'http://127.0.0.1:{port}'
    threading.Thread(target=httpd.serve_forever,daemon=True).start()
    def request(folder_id,payload=None,authenticated=True,csrf=True):
        headers={'Origin':os.environ['PUBLIC_ORIGIN'],'X-Requested-With':'portfolio-admin','Content-Type':'application/json'}
        if authenticated:headers['Cookie']='admin_session_local='+token
        if csrf:headers['X-CSRF-Token']=auth.csrf_for(token)
        c=http.client.HTTPConnection('127.0.0.1',port)
        try:
            c.request('DELETE',f'/api/folders/{folder_id}',json.dumps(payload).encode() if payload is not None else None,headers)
            response=c.getresponse();return response.status,json.loads(response.read())
        finally:c.close()
    def fixture(name):
        folder=database.save_folder(name)
        original=server.VIDEOS_DIR/(name+'.mp4');original.write_bytes(b'original test bytes')
        item=database.create_media(name,'','video',original.name,'/uploads/videos/'+original.name,19,'video/mp4',folder_id=folder['id'])
        poem=database.create_poem(name,'Test line',folder_id=folder['id'])
        link=database.create_media_share(item['id'])['token'];poem_link=database.create_media_share(poem['id'],kind='poem')['token']
        derived=server.VIDEOS_DIR/original.stem;derived.mkdir();(derived/'index.m3u8').write_text('old derivative')
        thumb=video_thumbnails.CACHE/f"{item['id']}-test.jpg";thumb.write_bytes(b'cache')
        clean=clean_downloads.CACHE/f"{item['id']}-test.mp4";clean.write_bytes(b'clean cache')
        return folder,item,poem,link,poem_link,[original,derived,thumb,clean]
    try:
        kept,item,poem,link,poem_link,paths=fixture('kept')
        assert request(kept['id'],{'include_contents':'yes'})[0]==400
        assert request(kept['id'],{'include_contents':True},authenticated=False)[0]==401
        assert request(kept['id'],{'include_contents':True},csrf=False)[0] in (401,403)
        assert all(path.exists() for path in paths)
        code,result=request(kept['id'])
        assert code==200 and result['contents_deleted'] is False
        assert database.get_media_by_id(item['id'])['folder_id'] is None
        assert database.get_poem_by_id(poem['id'])['folder_id'] is None
        assert database.resolve_media_share(link) and database.resolve_media_share(poem_link)
        assert all(path.exists() for path in paths)
        removed,media,poem,link,poem_link,removed_paths=fixture('removed')
        code,result=request(removed['id'],{'include_contents':True})
        assert code==200 and result['media_count']==1 and result['poem_count']==1 and result['cleanup_pending']==0
        assert database.get_media_by_id(media['id']) is None and database.get_poem_by_id(poem['id']) is None
        assert database.resolve_media_share(link) is None and database.resolve_media_share(poem_link) is None
        assert not any(path.exists() for path in removed_paths)
        assert all(path.exists() for path in paths),'Unrelated files must remain untouched'
        failed,media,poem,link,poem_link,failed_paths=fixture('retry')
        remove=media_storage.remove_files
        def fail(*args):raise PermissionError('Synthetic cleanup failure')
        media_storage.remove_files=fail
        try:code,result=request(failed['id'],{'include_contents':True})
        finally:media_storage.remove_files=remove
        assert code==200 and result['cleanup_pending']==1
        assert database.get_media_by_id(media['id']) is None and database.resolve_media_share(link) is None
        assert database.cleanup_unfinished_deletions(server.UPLOADS_DIR)==1
        assert not any(path.exists() for path in failed_paths)
        print('PASS: keep/default, delete contents and shares, validation, authentication/CSRF, unrelated files preserved, and failed cleanup retry.')
    finally:httpd.shutdown();httpd.server_close()
