# Operations

## Deployment

The production service is `portfolio.service`, running as the unprivileged
`azureuser` account in `/home/azureuser/portfolio-backend`. Caddy handles HTTPS
and proxies to `127.0.0.1:8000`. Keep port 8000 inaccessible from the internet.
SSH uses keys; password authentication is disabled. The supplied systemd drop-in
limits resources and filesystem access; paths must be adapted on another host.

1. Stage source and dependencies in an isolated directory and run the tests there.
2. Back up source, service/proxy configuration and SQLite with the SQLite backup
   API. Copying only the database file while WAL writes are active is unsafe.
3. Install `requirements.lock` with `pip install --require-hashes` in the production
   venv. Copy approved source/assets only, preserving uploads and the database.
4. Install the systemd drop-in in `/etc/systemd/system/portfolio.service.d/`, run
   `systemctl daemon-reload`, and restart `portfolio.service`.
5. Validate Caddy config with `caddy validate --config /etc/caddy/Caddyfile
   --adapter caddyfile` before reloading. The example is compatible with the
   deployed Caddy 2.6.2 distribution package.
6. Check `/api/health`, unauthenticated private API rejection, HTTPS login, and
   `journalctl -u portfolio.service`. Never log shared tokens or credentials.

Rollback requires the saved source/config and previous dependency versions. New
schema changes are additive. Do not restore a database over newer user uploads
without reconciling records and files.

## Data and deletion

SQLite uses WAL. Tables include media, poems, folders, admins, hashed auth sessions,
login-rate limits, activity logs, notifications, media_shares and share_egress.
Technical metadata is nullable and filled by uploads or bounded background jobs.
Media originals live under `uploads/images` or `uploads/videos`; thumbnail cache
is `uploads/.thumbnails`.

Deletion marks media pending, revokes sharing, removes its original, JPEG thumbnail
variants and matching legacy HLS directory, then purges the record. Failed file
cleanup leaves a private pending record for startup retry. Thumbnail jobs check
the active record before publishing, preventing deleted thumbnails reappearing.
Folder deletion returns contents to the library; it does not delete contained
files. Historical backups are independent retention copies and require separate
retention management; deleting a live file does not purge historical backups.

## Authentication and secrets

PBKDF2-HMAC-SHA256 with salted per-account hashes; 600,000 iterations. Sessions use
hashed random tokens, Secure/HttpOnly/SameSite=Strict cookies over HTTPS, eight-hour
absolute expiry and thirty-minute idle expiry. Writes require the expected origin,
requested-with header, and session CSRF token. Login limits persist in SQLite.
Forwarded client addresses are trusted only from the local reverse proxy. Browser
registration and legacy token authentication are disabled.

External-service configuration belongs outside source control in a mode-600 file
within a mode-700 directory. Do not put credentials in documentation or shell
history. Use `create_admin.py --help` for the interactive account reset utility.

## Shared video endpoints

- Authenticated GET/POST/DELETE `/api/media/<id>/share`: status, create/replace,
  revoke. Mutations require the same CSRF/origin checks as other private writes.
- Anonymous `/share/<token>`: minimal player page.
- Anonymous `/share/<token>/metadata`: selected file's display metadata.
- Anonymous `/share/<token>/file`: original video, with HEAD, conditional
  requests and HTTP byte ranges. Active status, expiry and hash are checked first.

Public assets are an explicit whitelist; there is no public media directory or
catalog. No referrer is sent, pages discourage indexing, framing is blocked by
CSP, and request logs redact share paths. A link is a bearer credential: recipients
can forward it. Revoke/replace it if it reaches an unintended person.

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
