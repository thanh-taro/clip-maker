# Offline checks for staging and production (F-021, ADR-0015)

The offline worker (`/sw.js`) checks every file it stores against the hash in `asset-manifest.json`.
A host that changes a file on the way out makes the install fail every time, and the tool then never
works offline (it still works online, with no visible error).

## Host requirements
- No HTML or script rewriting on the tool's host: no injected analytics or beacons, no email
  obfuscation, no Rocket Loader, no "auto minify" or other HTML/JS/CSS optimisation. Serve `dist/`
  byte for byte (compression in transit is fine).
- `/sw.js` and `/` are served with `Cache-Control: no-cache` (from the generated `_headers`).

## Staging smoke check (after each deploy, before production)
1. Open the staging address standalone in a fresh browser profile and wait about 10 s.
2. In the developer console, run:
   ```js
   const reg = await navigator.serviceWorker.getRegistration();
   const names = (await caches.keys()).filter((n) => n.startsWith('clip-maker-offline-'));
   const full = [];
   for (const n of names) if (await (await caches.open(n)).match('/asset-manifest.json')) full.push(n);
   ({ active: reg?.active?.state, caches: names, complete: full });
   ```
3. Expect `active: 'activated'` and one cache name under `complete`. If `active` is missing or
   `complete` is empty, the install failed: compare a served file with `dist/` (rewriting is the usual
   cause) and fix the host before shipping.
4. Optional: tick "Offline" in the Network panel and reload; the editor opens.

Repeat once embedded in the portal: embedded and standalone keep separate copies.
