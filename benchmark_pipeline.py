"""Origin benchmark with disposable storage; no live data or real credentials."""
import concurrent.futures
import http.client
import json
from pathlib import Path
import resource
import tempfile
import threading
import time
import tracemalloc
import os

os.environ['PUBLIC_ORIGIN'] = 'http://127.0.0.1'
import auth
import database
import server

with tempfile.TemporaryDirectory() as folder:
    root = Path(folder)
    database.DB_PATH = str(root / 'test.db')
    server.UPLOADS_DIR = root / 'uploads'
    server.VIDEOS_DIR = server.UPLOADS_DIR / 'videos'
    server.VIDEOS_DIR.mkdir(parents=True)
    database.init_db()
    auth.init_auth()
    auth.set_admin_password('benchmark', 'disposable benchmark password')
    admin = auth.authenticate('benchmark', 'disposable benchmark password')
    cookie = 'admin_session_local=' + auth.create_session(admin['id'])
    file = server.VIDEOS_DIR / 'benchmark.mp4'
    length = 32 * 1024 * 1024
    with file.open('wb') as output:
        output.truncate(length)
    database.create_media('Benchmark', '', 'video', file.name, '/uploads/videos/' + file.name, length, 'video/mp4')
    httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), server.PortfolioHandler)
    worker = threading.Thread(target=httpd.serve_forever, daemon=True)
    worker.start()
    server.PortfolioHandler.log_message = lambda *args: None

    def stream():
        connection = http.client.HTTPConnection(*httpd.server_address, timeout=20)
        connection.request('GET', '/uploads/videos/' + file.name, headers={'Cookie': cookie, 'Range': 'bytes=0-'})
        response = connection.getresponse()
        assert response.status == 206
        count = 0
        while chunk := response.read(64 * 1024):
            count += len(chunk)
            time.sleep(.001)
        connection.close()
        assert count == length

    def health(_):
        start = time.perf_counter()
        connection = http.client.HTTPConnection(*httpd.server_address, timeout=10)
        connection.request('GET', '/api/health')
        response = connection.getresponse()
        assert response.status == 200
        response.read()
        connection.close()
        return (time.perf_counter() - start) * 1000

    rss_before = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    tracemalloc.start()
    started = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        transfers = [pool.submit(stream) for _ in range(3)]
        latencies = list(pool.map(health, range(40)))
        for future in transfers:
            future.result()
    elapsed = time.perf_counter() - started
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    httpd.shutdown()
    httpd.server_close()
    worker.join()
    latencies.sort()
    print(json.dumps({'test': '3 concurrent 32-MiB streams plus 40 health requests over loopback', 'media_megabytes': 96, 'elapsed_seconds': round(elapsed, 3), 'effective_media_mib_per_second': round(96 / elapsed, 2), 'health_p95_ms': round(latencies[37], 2), 'python_peak_allocated_mib': round(peak / 1024**2, 2), 'peak_rss_growth_mib': round((resource.getrusage(resource.RUSAGE_SELF).ru_maxrss - rss_before) / 1024, 2)}))
