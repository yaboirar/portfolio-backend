# Review: 2026-10-30

Reviewed the Python handlers, authentication, storage pipeline, public sharing,
dependency versions, listening sockets, SSH configuration and service resources.
This is a focused engineering review, not a penetration-test certification.

## Findings addressed

- Upgraded Pillow 12.3.0 to 13.0.0; restricted image parsing to the expected format.
  Updated pip in the test environment. The final isolated installed dependency
  audit reported no known vulnerabilities. Dependencies are pinned with hashes.
- Limited uploads to one in flight; enforce 10 GiB system headroom before reading
  bodies. JSON, request, file size, image dimensions and video probe time are bounded.
- Serialized native media jobs, limited Linux address space/CPU and subprocess
  timeouts, and bounded probe stdout reads. Metadata/thumbnail queues and failure
  caches are bounded. HTTP request workers are capped at 32.
- Fixed original/thumbnail/HLS deletion consistency and cancellation races.
- Removed wildcard cross-origin access; added no-referrer and restricted browser
  permissions. HTTPS no longer has an implicit nonlocal-IP exception.
- Corrected persistent login rate limits to use proxy-validated client addresses.
- Sharing is video-only, opt-in, hash-only, expiring/revocable, with four concurrent
  public file responses and a persistent daily egress budget. No private APIs or
  admin controls appear in the public viewer. All shared text uses textContent.
- Expanded Git exclusions to cover thumbnails, database backups and credentials.
  Replaced outdated credential-bearing documentation in the current source tree.

## Validation

- 21 unit tests passed (authentication and external service integration).
- 15 consolidated regression groups passed: parser/truncation, original bytes,
  upload validation, deletion recovery, ranges, traversal, cookies, CSRF and disabled
  registration/legacy auth. Media editing permission checks passed as well.
- Pipeline checks passed for duration/dimensions, storage 507/admission 429,
  folder CRUD/moves, thumbnail privacy, notifications, random sharing, anonymous
  ranges, expiry/revocation, hash-only storage, egress 429, and derivative cleanup.
- JavaScript syntax checks passed. Synthetic UI review covered category dropdown,
  details dialog, share controls and the standalone video/description player.
- Loopback benchmark: three concurrent 32 MiB streams plus 40 health requests:
  96 MiB transferred in 0.639s; health p95 20.84ms; Python allocation peak 0.71 MiB;
  peak RSS growth 1.88 MiB. This is origin overhead, not an internet speed promise.

## Capacity and limits

The VM has approximately 0.88 GB RAM, two logical CPUs and 65.4 GB disk. The default
10 GiB disk reserve leaves around 54.7 decimal GB of usable capacity. Proposed
deployed service guardrails: MemoryHigh 384 MiB, MemoryMax 512 MiB, swap max 512 MiB,
CPU quota 150%, 80 tasks and 2,048 descriptors. Caddy body size/timeouts are bounded.
UFW is enabled with inbound SSH, HTTP and HTTPS allowed; the backend remains
loopback-only. A synthetic production HTTPS upload/share/range/revoke/delete smoke
test passed after service hardening. The final production installed-dependency
audit also reported no known vulnerabilities.

VPS Azure billing/bandwidth quotas and external network firewalls were not available
from the guest audit. Browser codec support and the original video's bitrate and
MP4 layout affect startup; originals are deliberately not re-encoded. A playable
video can be captured; hidden download controls are not DRM. No application can
guarantee immunity to all attacks or unlimited throughput on this VM.

Distribution packages were compared with configured apt metadata; the installed
Caddy, Python and OpenSSL versions matched its candidates. That is not a fresh
vendor vulnerability scan of every OS package. Continue normal Ubuntu security
updates and periodic dependency audits. Prior Git history and independent backups
may retain old material; this update does not rewrite history or purge backups.

References: [Pillow security](https://pillow.readthedocs.io/en/stable/handbook/security.html),
[Pillow 13 release notes](https://pillow.readthedocs.io/en/stable/releasenotes/13.0.0.html),
[Werkzeug changes](https://werkzeug.palletsprojects.com/en/stable/changes/).
