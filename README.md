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
- Opt-in file sharing: file actions → Share file → Create link. Default expiry
  is seven days; alternatives are one day, thirty days, or no expiry. Disable
  Shared view to revoke. Creating a replacement invalidates the previous link.
- Anonymous share pages expose only the chosen file, player, title and description.
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

## Sharing interface update

Share is available from the video preview toolbar and its context menu. Enabling
the switch only prepares the form; Create link explicitly publishes access.
Details and download is an optional per-link setting, off by default. When enabled,
the shared viewer's single details icon exposes only title, type, formatted
duration, dimensions and a download link. Original filename, timestamps, IDs and
raw duration seconds are not returned in public metadata. The download endpoint
rechecks the same token/expiry/permission and uses a generic video filename.
Settings → Shared links lists generated access grants and allows revocation.
The old test route is removed; existing test grants are revoked once during this
migration. New grants survive subsequent restarts.

## Image, video and poem sharing; optional privacy copies

Sharing supports every individual file type in this workspace: images, videos
and poems. Each file has its own expiring/revocable grant. Media owner routes are
`/api/media/<id>/share`; poems use `/api/poems/<id>/share`. Shared pages use `/share/`.
The list in Settings → Shared links contains both kinds. Download is an icon with
an accessible label, and only appears inside the optional public details panel.
Folders remain organizational containers; no catalog is made public by a file link.

With Details and download enabled, Remove embedded metadata can be selected.
For images and video this serves a separately prepared cleaned copy through BOTH
the public playback/file and download endpoints. The private original remains
unchanged and its private URL is never exposed by the shared metadata API.
Poems download as plain UTF-8 text, without embedded media tags.

Install FFmpeg/FFprobe and `libimage-exiftool-perl` from Ubuntu packages. Video
cleanup remuxes the main video/audio tracks with stream copy, excluding data tracks,
chapters, global/stream descriptive tags; it does not re-encode. Images use
ExifTool `-all=`, preserving only orientation for correct display. Standard
EXIF/GPS/XMP/IPTC and supported software/author/date/comment tags are removed.
Structural information needed to decode the media, such as dimensions and codec,
remains. This is not guaranteed forensic anonymity: visible or audible identifying
content and unsupported proprietary metadata are not promised removed.
See [ExifTool documentation](https://exiftool.org/exiftool_pod.html) for format limits.

Preparation is asynchronous: one bounded worker, queue size eight, shared native
process gate/resource limits, 45-second process timeout, 2 GiB cache budget and
disk-reserve checks. The viewer shows a preparation message and polls briefly.
Failure never falls back to exposing the original on a privacy-enabled link.
Deleting the original cancels/removes its cleaned variants; temporary partial
outputs are removed on failure and startup. Exclusions cover all upload caches.

## Folder deletion choice

The confirmation dialog defaults to keeping folder contents in All files. Select
Also delete everything inside to permanently delete its images, videos and poems,
including their sharing grants, original files and derived caches. Bulk deletion
also asks whether to include contents of selected folders. Failed filesystem
cleanup stays inaccessible and pending for retry at startup.

Additional checks: `python test_folder_delete.py` and `node tests/preview_fit.js`.
