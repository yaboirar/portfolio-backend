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
- Anonymous `/videoshared/<token>`: minimal player page.
- Anonymous `/videoshared/<token>/metadata`: selected video's display metadata.
- Anonymous `/videoshared/<token>/file`: original video, with HEAD, conditional
  requests and HTTP byte ranges. Active status, expiry and hash are checked first.

Public assets are an explicit whitelist; there is no public media directory or
catalog. No referrer is sent, pages discourage indexing, framing is blocked by
CSP, and request logs redact share paths. A link is a bearer credential: recipients
can forward it. Revoke/replace it if it reaches an unintended person.
