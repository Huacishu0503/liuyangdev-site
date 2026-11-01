Xi'an cover changed to existing photo /uploads/ef71636d5ebf7546956e48f417d082ec9539259c47cdecab2ef65c77477b47dc.webp (tower scenery). All 98 photo entries, order and metadata preserved; only the cover changed in the published snapshot. Worker now accepts authenticated cover selection restricted to a photo belonging to the same album. publicTrip honors an explicit valid cover; deleting unrelated photos preserves it and deleting the selected photo falls back safely. Nine local Worker/gateway tests passed including cover validation/order/deletion. Live card and letter cover src and image decoding verified. Before state: private/xian-before-cover-change.json. Worker version 68fe8637-c314-4aba-a9bb-03331181b911.

BGM changed to Canon in D, solo piano performed by Lee Galloway. Source and CC BY-SA 3.0 permission verified on Wikimedia Commons; downloaded with a descriptive User-Agent and original SHA-1 verified. Source Ogg remains private; public MP3 is 171.075918 seconds / 3422749 bytes, full-file decoded successfully. Transcoded for compatibility without cutting the performance. Hosted within existing authenticated Worker assets; no third-party audio hotlink. Attribution is visible on home and memories pages and detailed in music-credits.html, linking performer, original source and CC BY-SA license. Existing volume cap, user pause preference, loop and controls retained. Browser verified currentSrc, playback progress, duration, no decode error, pause and resume. MP3 byte hash matches remote. Asset binding returned a complete 200 response to a Range request; full-file playback verified. Worker version 6baa65ad-c252-445d-8f53-cc9cdd4a32ec.

School/holiday clarification: owner's school photos cover 2023—2026 and remain a single broad period, not a dated event. Set all 4 school volumes to date=2023—2026 and all 3 Nanning volumes to date=2025年国庆. The anniversary is separate, then the school-period section, then dated journeys beginning Nanning 2025 National Day, Nanjing+Qingdao 2026-08, Xi'an 2026-10-02. Holiday sorting uses October internally but never fabricates a day or an exact legal holiday range. All 1291 photo entries preserved and unrelated albums/drafts verified unchanged. Month, holiday and year-range date fields now survive management form editing (text input instead of a date-only control). Four collection/date tests passed and live UI verified. Worker version e20e4160-374d-4575-9e31-9e42ba608e64.

Timeline dates corrected per owner: both Nanjing+Qingdao source volumes now date=2026-08 (month precision), Xi'an date=2026-10-02 and place/title=陕西西安26.10.2. Updated through normal PATCH/publish after checking the three targets had no pending drafts. Public photo content and every other album/draft verified unchanged, including an unpublished Guilin draft. Before state: private/before-timeline-date-correction.json. Current public snapshot: private/current-public-albums.json. Source migration snapshot retains its historical dates for audit. Three collection/date tests passed; UI verified month-only display and 2026 ordering. Worker version 877f02bf-4c45-4705-8291-5b46c21d0eb7.

## Collection and timeline update

Published frontend version 4e5e6139-9eb2-44f8-9f9a-410843705d85. Display-only merging reduces 10 backend volumes to 4 reader collections (539 / 393 / 261 / 98 photos). All 1291 photo entries and their within-volume ordering remain unchanged; management still edits the original backend volume IDs.

New timeline uses the configured anniversary, validated explicit album dates, and the validated 25.10.2 date in the Xi'an album name (shown with its source). Albums without dates are separate and never assigned invented chronology. Category filters apply to both reading modes. Imported photo metadata is not rewritten.

After opening a letter, show 36 photos at a time. Lightbox still traverses the complete collection, including the last photo, with an 11-thumbnail window. Browser verification: first batch 36 / remaining 503; next batch 72 / remaining 467; lightbox final photo 539/539 loaded successfully. Desktop and 390px responsive screenshots verified, no horizontal overflow. Existing outer and per-entry travel passwords (kept outside this public repository) and BGM remain active. Two collection/date unit tests passed.

Password rotation: owner requested the shared site/view/manager password be changed to the new value recorded in the login information document. Cloudflare salt/hash and local .dev.vars updated, 6 prior sessions revoked, new password verified for viewing and management on all four public domains, previous password rejected. See password-change-verification.json.

# Current production

Formal URL: https://liuyangdev.site/ . The owner confirmed phone access, photos and music. Apex and www are active Pages custom domains, backed by the fully hosted Worker. Cloudflare free DNS now uses hera/remy nameservers. Original Tencent copy remains backed up.

Album privacy lock deployed: all HTML entry points, album metadata and photo files require a server-verified session. The existing management password also unlocks viewing. Viewer tokens use a separate hash namespace and cannot act as manager tokens. Cookies are HttpOnly, Secure and SameSite=Strict, scoped to /. Authenticated assets use private,no-store. Pages routes every request to the backend; Worker assets run_worker_first=true and html_handling=none prevent bypasses and HTML redirect loops. No password is embedded in frontend files. The header lock button has been removed. Every transition from home into memories requires the existing password through a modal, even with a valid outer viewing session. The first metadata fetch and photo rendering wait for the first successful travel unlock. Cancel and wrong passwords leave the home panel visible; returning home resets the travel gate. Existing downloaded copies cannot be revoked.

Tests: 8 local suites passed; full login/lock/logout/metadata/photo tests passed on apex, www, test and pages.dev. Browser submission and lock button verified on production. Evidence: album-lock-verification.json and outputs/相册密码锁-正式站.png.

DNSSEC: Cloudflare signing enabled; replacement DS (2371 / 13 / 2 / A4767E47C44565F93F272FCD6CBA0314EBCF161FE88EAD94CAFD0CF8312D1261) saved at Spaceship after old NS caches expired. Parent DS publication and authenticated public DNS answers verified; DNSSEC restoration complete.

# Our Story Cloudflare trial

This copy is isolated from the mainland production server. Do not add a custom domain or change production DNS until the owner has tested the trial URL on their phone.

## Live trial, verified 2026-10-29

- Owner-facing URL: `https://test.liuyangdev.site/#memories`
- Management: `https://test.liuyangdev.site/manage.html`
- Fallback: `https://our-story-liuyang-2026.pages.dev/#memories`
- Pages gateway: `our-story-liuyang-2026`, production branch `main`, service binding `STORY` to `our-story-romantic-trial`.
- Original apex `A 114.132.218.113`, `www CNAME liuyangdev.site`, Spaceship nameservers and DNSSEC DS were retained. Only `test CNAME our-story-liuyang-2026.pages.dev` was added, TTL 1800.
- The owner confirmed photos and BGM work on their phone over mobile data at the Pages URL. Both the Pages and custom-domain endpoints passed metadata equality, 25 sampled file checksums, unchanged password login, upload, duplicate detection, publish, draft isolation, immediate last-photo deletion, archive and logout. Full shared backend verification checked 1317 files and all 1291 published photo records.
- Custom domain certificate status is active. No billing subscription or R2 activation was performed.

### Gateway maintenance

Run `python pages-gateway/prepare.py` after frontend changes; it copies frontend assets without duplicating the 1293 stored image files. The `_worker.js` gateway forwards only API and upload paths through the internal service binding, preserving URL, Origin, body and cookies. Pages serves other frontend files directly. `404.html` disables Pages' implicit SPA fallback; hash navigation still works.

The Pages gateway was deployed using the tested `wrangler-pages` package alias (Wrangler 4.53.0), from the `pages-gateway` directory with its own config. Wrangler 4.154 automatically delegates some Pages commands to Workers, which is unsuitable for this externally managed subdomain workflow. Do not accidentally run a Pages create command from the backend Worker directory.

Deploy gateway: `node ../node_modules/wrangler-pages/bin/wrangler.js pages deploy public --project-name our-story-liuyang-2026 --branch main` from `pages-gateway/`.

Tests: set `TEST_PHOTO_KV=1` and `TEST_GATEWAY=1`, then `node --test tests/worker.test.mjs`. These run against isolated local storage. Remote evidence: `remote-verification.json` and `gateway-verification.json`. The original `workers.dev` hostname is affected by incorrect DNS resolution on the owner's normal network; it was checked with a request-scoped verified DNS diagnostic, without changing system DNS or disabling certificate validation. The live Pages/custom-domain checks required no DNS override.

- Worker: `our-story-romantic-trial`
- D1: `our-story-trial` stores album drafts, published snapshots, sessions and daily metadata backups.
- Imported photos: immutable static assets, with original `/uploads/<sha256>.webp` URLs.
- New uploads: the free Workers KV binding `PHOTO_KV`; the Worker serves validated immutable image paths. Existing imported photos are not copied to KV and do not consume its daily write allowance.
- Existing password: verified against the original scrypt hash; the same password is retained with a PBKDF2-SHA256 verifier in Worker secrets.
- No origin proxy: all pages, music, photos and metadata are included. The trial has no dependency on the blocked Tencent server.

## Before deployment

Use the owner's Cloudflare account. Do not activate paid subscriptions or enter billing details on their behalf. This trial uses Workers Free, D1 and KV; R2 is not enabled.

1. Authenticate Wrangler with account/user read, Workers write and D1 write access.
2. Check `whoami` matches the account selected by the owner.
3. Create D1 and update only `database_id` in `wrangler.jsonc`.
4. Create KV namespace `our-story-trial-photos` and bind `PHOTO_KV`.
5. Apply both migrations, `seed.sql` and `photo-seed.sql` to the new trial database only. The seed uses `INSERT OR IGNORE` to prevent accidental overwrite on retry.
6. Install `private/secrets.json` using `wrangler secret bulk`; do not log or upload it as an asset. `STORY_DEV` must remain local only.
7. Deploy with Wrangler. Keep `preview_urls` disabled and use its `workers.dev` address for the phone test.
8. Verify the published metadata equals the source snapshot, check all images and BGM, then exercise create/upload/publish/delete/archive on a clearly named trial album and remove it from public view.

## Local verification

`TEST_PHOTO_KV=1 node --test tests/worker.test.mjs` runs in Cloudflare's local runtime with real local D1 and KV bindings, isolated from all production data. It covers all imported public snapshots, password checks, sessions, origin checks, throttling, duplicate uploads, concurrent writes, publication, draft isolation, immediate deletion, last-photo withdrawal, shared image retention, backups, HTTP range requests, validation, archive and logout. Without this environment variable the same suite also checks the optional R2 adapter for a future upgrade.

KV Free currently allows 1 GB storage, 1,000 new writes/day and 100,000 reads/day; exceeding free quotas fails the relevant operation instead of activating paid billing. Binary photo keys are immutable and never deleted with album metadata. A D1 registry avoids rewriting the same file. KV replication can take 60 seconds or more across locations; a newly uploaded image may need a short wait before appearing elsewhere. Album metadata, authentication and immediate removal remain in D1 and do not depend on KV propagation.

Wrangler local preview listens on `http://127.0.0.1:4820/`. It uses the real imported password and a separate local database. The test suite uses a different disposable database and password.

## Private material

Keep `.dev.vars`, `private/`, `seed.sql`, the migration archive, original server configuration, and TLS keys outside `public/`. Never include them in a public repository or asset upload. Full private backup remains in `../site-migration/`.

## Rollback

The trial creates new resources only. The original DNS, Tencent release, database and backups remain unchanged. Before a later domain cutover, resnapshot production to include any edits or uploads made since the original backup; do not seed an outdated snapshot over a trial database with newer changes.
