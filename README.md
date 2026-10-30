# MILV67 private media workspace

Private Python/SQLite file manager, with a separate public portfolio placeholder.
Original images and videos are preserved byte for byte. FFprobe reads technical
metadata; FFmpeg generates small JPEG video thumbnails. Normal uploads do not
re-encode video or generate HLS.

## Run

Use Python 3.12+, FFmpeg/FFprobe, and a HTTPS reverse proxy. Install the pinned,
hashed dependencies in a virtual environment:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/pip install --require-hashes -r requirements.lock
.venv/bin/python create_admin.py --help
PUBLIC_ORIGIN=https://your-domain.example .venv/bin/python server.py 8000
```

The server listens on loopback. Set PUBLIC_ORIGIN to your actual HTTPS origin.
The login route is `/ventilover67adminlogin`; the workspace is `/MILV67`.
There is no browser registration. Create/reset accounts locally with the CLI;
never commit passwords, session tokens, API keys, SQLite files, or uploads.
Changing a route is not an authentication defense.

## Features

- Folders with colors, tags, descriptions, drag-and-drop moves and uploads.
- List/grid views, selection, details menus, image zoom, custom video player.
- Duration/dimension metadata, bounded thumbnail and metadata workers.
- Storage meter with a default 10 GiB system reserve enforced on uploads.
- Opt-in video sharing: video actions → Share video → Create link. Default expiry
  is seven days; alternatives are one day, thirty days, or no expiry. Disable
  Shared view to revoke. Creating a replacement invalidates the previous link.
- Anonymous share pages expose only the chosen video, player, title and description.
  Private APIs, folders, deletion and editing remain authenticated. Share tokens
  have 192 random bits and are stored only as hashes. Existing URLs cannot be
  recovered from the database; keep the copied link or generate a replacement.
- Native video download controls and right-click saving are hidden. This is UI
  behavior, not DRM: anyone able to watch can technically capture the video.

## Resource settings

`STORAGE_RESERVE_BYTES` defaults to 10737418240 (10 GiB). The meter includes OS and
other VPS disk usage. Upload admission checks twice the request size for temporary
headroom, accepts one upload at a time, and rejects low space with HTTP 507.
Limits are 500 MiB/video, 25 MiB/image, and 550 MiB/request.

Public shares allow four simultaneous file responses and a combined persistent
10 GiB/day transfer budget, reset at UTC midnight. Set `SHARE_DAILY_LIMIT_BYTES`
to adjust the allowance. This is an application guardrail, not an Azure billing
quota. Interrupted transfers refund unsent bytes where measurable. TLS/proxy
overhead and other endpoints are not included. Revocation stops new requests;
it cannot retract bytes already downloaded or guarantee interruption of an
already-open stream.

See [SYSTEM_DOCUMENTATION.md](SYSTEM_DOCUMENTATION.md),
[SECURITY_REVIEW.md](SECURITY_REVIEW.md), `Caddyfile.example`, and
`portfolio-hardening.conf` for deployment and verification details.

## Tests

Run in a disposable copy, never against the production working directory:

```sh
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python test_server.py
.venv/bin/python test_pipeline.py
.venv/bin/python benchmark_pipeline.py
```

Tests use generated images and test-pattern video, not private media.
