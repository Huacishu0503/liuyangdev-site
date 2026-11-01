# Formal domain cutover, 2026-10-29

Owner authorized moving the tested Cloudflare site to `liuyangdev.site` and explicitly approved temporary DNSSEC withdrawal followed by re-enablement.

## Prepared and verified

- Original Tencent library still matches the migration backup: 10 published albums / 1291 photos.
- Current Cloudflare D1 exported to `private/pre-cutover-D1.sql` before any domain changes.
- Original server and full private migration archive retained.
- Free Cloudflare full zone: `1571403a4f38ac4c594992dd450ae135`.
- Assigned nameservers: `hera.ns.cloudflare.com`, `remy.ns.cloudflare.com`.
- Original authoritative nameservers: `launch1.spaceship.net`, `launch2.spaceship.net`.
- Cloudflare zone records staged as proxied CNAMEs to `our-story-liuyang-2026.pages.dev` for `@`, `www`, and `test`.
- Pages custom domains staged for apex and www, retaining the working test domain.
- Full application and immutable media are Cloudflare-hosted. No origin proxy to Tencent is used.

## DNSSEC sequencing

Spaceship automatic DNSSEC was disabled through its authenticated dashboard after explicit owner confirmation. Initial TLD queries still showed the old DS while Spaceship's authoritative zone had already stopped signing; validating resolvers could temporarily return SERVFAIL. Use the Pages fallback URL during propagation.

Authoritative TLD DS absence was first directly observed at the timestamp recorded in `private/dnssec-cutover.json`. The previous DS TTL was 900 seconds. Wait that full interval before changing nameservers. The observed old apex NS TTL was 1800 seconds and parent NS TTL 900 seconds; preserve the old zone until caches expire before registering the new Cloudflare DS.

The Cloudflare dashboard did not yet enable DNSSEC while the zone was pending; retry after activation, then publish exactly its current DS at Spaceship. Do not publish an unverified/stale key or mark security restored based only on a UI toggle. Verify a validating public resolver returns authenticated answers and the parent DS matches Cloudflare.

## Validation after activation

Run `python verify_remote.py https://liuyangdev.site --quick` using normal DNS. It compares all 1291 published photo records, checks 25 file hashes including BGM, checks private paths return 404, logs in with the unchanged password, and exercises one clearly named disposable album through upload/publish/delete/archive. Confirm www, test and HTTPS also work. Final evidence goes in `formal-domain-verification.json`.

## Recovery

The Spaceship original DNS records remain saved and can be reactivated by restoring its old nameservers. Their mainland origin remains subject to the original Tencent access block, so the working Pages URL is the preferred temporary visitor fallback. Do not erase the original VM or seed old metadata over current D1 changes.
