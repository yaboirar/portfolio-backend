import json
import database

with database.get_db() as conn:
    print('Admin accounts:', json.dumps([dict(r) for r in conn.execute('SELECT id, username, created_at FROM admins')]))
    print('Active session count:', conn.execute('SELECT COUNT(*) FROM auth_sessions').fetchone()[0])
    print('Registration audit events:', json.dumps([dict(r) for r in conn.execute("SELECT timestamp, action, status_code, input_data FROM activity_logs WHERE action LIKE 'register%' ORDER BY timestamp DESC LIMIT 20")]))
