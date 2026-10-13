# Creative Portfolio Backend

Python backend for videos up to 50 MiB, images up to 10 MiB, and poems. SQLite stores text and media descriptions; media files live in `uploads/`. The existing dashboard and API endpoints are included.

## Local setup

Use Python 3.11 or newer. Install **FFmpeg**, which includes `ffprobe`, and ensure both commands are on your PATH. For example, on Ubuntu/Debian:

```bash
sudo apt install ffmpeg
```

On Windows, install FFmpeg from its official distribution instructions and add its `bin` directory to PATH. Confirm the installation:

```bash
ffmpeg -version
ffprobe -version
```

Create an isolated Python environment and install packages:

```bash
python -m venv .venv
```

Activate it with `source .venv/bin/activate` on macOS/Linux, or `.venv\Scripts\Activate.ps1` in Windows PowerShell. Then:

```bash
python -m pip install -r requirements.txt
python server.py
```

Open `http://localhost:8000`. An optional port can be supplied with `python server.py 8080`.

The application creates `portfolio.db`, upload directories, and a random `.admin_token` on first use. Enter that token into the dashboard when prompted, or supply your own secret through the `PORTFOLIO_ADMIN_TOKEN` environment variable. Keep secrets, the live database, and uploaded files out of GitHub. Back them up separately.

## Upload behavior

- Werkzeug's streaming multipart decoder handles file parts. A small adapter requires complete closing delimiter lines and enforces one file, at most 10 parts, 4 KiB of headers per part, and 10 KiB per text field.
- Video parts stream to temporary files with bounded Python buffers. Images are decoded into memory for processing; their memory use depends on pixel dimensions.
- The complete declared request body must arrive before an upload is committed. Early EOF or missing multipart closure rejects the upload. Upload parse errors close the connection to prevent leftover bytes becoming another request.
- Upload requests require `Content-Length`. Chunked upload requests are not supported. The global request limit is 60 MiB, including form overhead.
- Pillow verifies images and normalizes EXIF orientation before re-encoding JPEG, PNG, or WebP. Re-encoding can change image file sizes and quality. Video metadata is retained.
- FFprobe inspects MP4, MOV, and WebM containers and requires an identified video codec, positive dimensions, and positive finite duration. Silent videos are supported; audio-only files and header stubs are rejected. Inspection has a 15-second timeout and does **not** decode every frame or guarantee that every browser supports the codec.
- A failed response delivery never removes an already committed upload.

## Deletion and recovery

Deletion first marks a media record `pending_delete`. Public lists and file URLs then stop serving it. The file is removed before the record is purged. Failed removal preserves the pending record for retry.

Startup recovery and authenticated `POST /api/admin/cleanup` retry pending deletions. A failed cleanup removal also preserves the record, rather than falsely counting it as purged. Temporary files are outside the public media directory; cleanup only removes temporary files older than one hour, avoiding immediate deletion of current uploads.

## Tests

FFmpeg and FFprobe must be available for real video fixtures.

```bash
python test_server.py
python -m unittest -v test_backend
```

The HTTP suite covers uploads, boundary-prefix preservation, incomplete requests, images, ranges, and deletion access. The additional suite covers read splits from 1 through 64 bytes, headers and field limits, cleanup failures and retries, trackless containers, fake WebM files, and real silent MP4/MOV/WebM videos.

The parser-memory check excludes construction of the input bytes. Test results describe the exercised cases, not proof of an absence of defects. The HTTP suite creates and removes test records in the configured local database; run it in a development checkout, not against production data.

## API

Public reads:

- `GET /api/health`, `/api/stats`
- `GET /api/media`, `/api/media/<id>`; optional `?type=video` or `?type=image`
- `GET /api/poems`, `/api/poems/<id>`; optional `?tag=reflection`
- `GET /uploads/videos/<filename>` or `/uploads/images/<filename>` for active media only

Owner operations require `X-Admin-Token` or `Authorization: Bearer <token>`:

- `POST /api/upload`: multipart fields `file`, `title`, `description`
- `POST /api/upload/raw?filename=showreel.mp4&title=Reel`: raw file body
- `DELETE /api/media/<id>`
- `POST /api/poems`, `PUT /api/poems/<id>`, `DELETE /api/poems/<id>`
- `POST /api/admin/cleanup`

## Before public hosting

This application still uses Python's development HTTP server. Configure a production HTTPS proxy, request/connection limits, persistent storage, and backups before publishing. Only one application instance should own this local SQLite database and media directory. Range support enables seeking, but playback speed still depends on codec, bitrate, and network conditions.

Back up SQLite through its online backup API and back up media files separately. Hosting and the public portfolio's creative design are separate decisions.
