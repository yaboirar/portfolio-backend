"""Folder grants with explicit membership or inherited access to current/future files."""
import hashlib,re,secrets,time
import database

def _validate(body):
    scope=body.get('scope','selected');ids=body.get('item_ids',[])
    if scope not in ('all','selected'):raise ValueError('Choose all files or a manual selection')
    if not isinstance(ids,list) or len(ids)>1000 or any(type(i) is not int or i<1 for i in ids):raise ValueError('Invalid file selection')
    expiry=body.get('expires_in',604800);details=body.get('allow_details',False);clean=body.get('strip_metadata',False)
    if type(expiry)is not int or expiry not in (0,86400,604800,2592000):raise ValueError('Choose a valid expiry')
    if type(details)is not bool or type(clean)is not bool or clean and not details:raise ValueError('Invalid folder sharing options')
    return scope,list(set(ids)),expiry,details,clean

def create(folder_id,body):
    scope,ids,expiry,details,clean=_validate(body);token=secrets.token_urlsafe(24);now=int(time.time())
    with database.get_db() as conn:
        conn.execute('BEGIN IMMEDIATE');database.validate_folder(conn,folder_id)
        if scope=='selected':
            for item_id in ids:
                row=conn.execute("SELECT media_type FROM media WHERE id=? AND folder_id=? AND status='active'",(item_id,folder_id)).fetchone()
                if not row:raise ValueError('Select files from this folder only')
        expires=now+expiry if expiry else None
        conn.execute('INSERT INTO folder_shares VALUES (?,?,?,?,?,?,?) ON CONFLICT(folder_id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,expires_at=excluded.expires_at,allow_details=excluded.allow_details,strip_metadata=excluded.strip_metadata,scope=excluded.scope',(folder_id,hashlib.sha256(token.encode()).hexdigest(),now,expires,int(details),int(clean),scope))
        conn.execute('DELETE FROM folder_share_items WHERE folder_id=?',(folder_id,))
        if scope=='selected':
            for item_id in ids:conn.execute('INSERT INTO folder_share_items VALUES (?,?,?)',(folder_id,item_id,secrets.token_urlsafe(12)))
    return {'path':'/share/'+token,'created_at':now,'expires_at':expires}

def owner_status(folder_id):
    with database.get_db() as conn:
        database.validate_folder(conn,folder_id)
        row=conn.execute('SELECT created_at,expires_at,allow_details,strip_metadata,scope FROM folder_shares WHERE folder_id=?',(folder_id,)).fetchone()
        current=dict(row) if row and (row['expires_at'] is None or row['expires_at']>time.time()) else None
        files=[dict(row) for row in conn.execute("SELECT id,title,media_type FROM media WHERE folder_id=? AND status='active' ORDER BY id DESC LIMIT 1000",(folder_id,))]
        ids=[row[0] for row in conn.execute('SELECT media_id FROM folder_share_items WHERE folder_id=?',(folder_id,))] if current else []
    return {'shared':bool(current),'share':current,'files':files,'item_ids':ids}

def revoke(folder_id):
    with database.get_db() as conn:conn.execute('DELETE FROM folder_shares WHERE folder_id=?',(folder_id,))

def resolve(token):
    if not re.fullmatch(r'[A-Za-z0-9_-]{32}',token):return None
    with database.get_db() as conn:
        row=conn.execute('SELECT s.*,f.name AS title,f.description FROM folder_shares s JOIN folders f ON f.id=s.folder_id WHERE s.token_hash=? AND (s.expires_at IS NULL OR s.expires_at>?)',(hashlib.sha256(token.encode()).hexdigest(),int(time.time()))).fetchone()
    return dict(row) if row else None

def page(grant,page_number=1):
    page_number=max(1,min(10000,page_number));offset=(page_number-1)*100
    with database.get_db() as conn:
        if grant['scope']=='all':
            # Stable opaque child keys are not standalone grants; the parent token is required.
            ids=conn.execute("SELECT id FROM media WHERE folder_id=? AND status='active' ORDER BY id DESC LIMIT 101 OFFSET ?",(grant['folder_id'],offset)).fetchall()
            for row in ids:conn.execute('INSERT OR IGNORE INTO folder_share_items VALUES (?,?,?)',(grant['folder_id'],row[0],secrets.token_urlsafe(12)))
            values=[row[0] for row in ids]
            rows=conn.execute("SELECT m.title,m.media_type,i.public_key FROM media m JOIN folder_share_items i ON i.media_id=m.id WHERE i.folder_id=? AND m.id IN ("+','.join('?' for _ in values)+") ORDER BY m.id DESC",[grant['folder_id']]+values).fetchall() if values else []
        else:rows=conn.execute("SELECT m.title,m.media_type,i.public_key FROM media m JOIN folder_share_items i ON i.media_id=m.id WHERE i.folder_id=? AND m.folder_id=? AND m.status='active' ORDER BY m.id DESC LIMIT 101 OFFSET ?",(grant['folder_id'],grant['folder_id'],offset)).fetchall()
    return [{'title':row['title'],'kind':'document' if row['media_type']=='other' else row['media_type'],'key':row['public_key']} for row in rows[:100]],len(rows)>100

def child(grant,key):
    if not re.fullmatch(r'[A-Za-z0-9_-]{16}',key):return None
    with database.get_db() as conn:
        row=conn.execute("SELECT m.* FROM media m JOIN folder_share_items i ON i.media_id=m.id WHERE i.folder_id=? AND i.public_key=? AND m.folder_id=? AND m.status='active'",(grant['folder_id'],key,grant['folder_id'])).fetchone()
    if not row:return None
    result=dict(row);result.update(allow_details=grant['allow_details'],strip_metadata=grant['strip_metadata'] if row['media_type'] in ('image','video') else 0);return result

def listing():
    with database.get_db() as conn:return [dict(row) for row in conn.execute("SELECT s.folder_id AS media_id,f.name AS title,s.created_at,s.expires_at,'folder' AS item_kind FROM folder_shares s JOIN folders f ON f.id=s.folder_id")]
