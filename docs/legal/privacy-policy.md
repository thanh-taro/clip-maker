# DRAFT — needs legal review

# Privacy policy — Clip Maker

Effective date: `<OWNER: set at publication>`. Operator and contact: `<OWNER: legal name, address, email>`.
Drafted from the QA privacy audit (`.build-my-app/reports/qa-security.md`) and COPY-privacy.details.

## Summary
Clip Maker runs entirely in your browser. Your videos, photos, music and projects never leave your
device. There are no accounts, no analytics, no advertising and no trackers.

## What we collect
Nothing. No personal data is collected, sent to us, or shared with third parties. No crash or
error reporting, no cookies, no fingerprinting.

## What stays on your device
| Storage | What | Lifetime |
|---|---|---|
| Page memory | The project, opened media, preview, undo history, theme, language | Gone when the page closes |
| Browser private file storage (OPFS), folder `clip-maker-scratch/` | Temporary export files while an export is built | Deleted when the export ends; after a success, 10 s after the browser takes the file; if the page closed first, the next time Clip Maker opens in the same browser context |
| Web Locks | One lock name per open tab | Released when the tab closes |
| Cache Storage `clip-maker-offline-<version>` | An offline copy of the tool's own files (about 12 MB), no user data | Until replaced by a new version, evicted, or you clear site data |
Cookies, localStorage, sessionStorage and IndexedDB are not used. When embedded in the TaroKit
portal, some browsers keep separate storage for the embedded and the standalone tool.

## Network
The tool requests only its own files from its own address over HTTPS. No request carries your
media, project or any user data, and the tool's security policy blocks connections to other
origins. Like any website, the hosting provider (Cloudflare) receives standard request metadata
(IP address, user agent, time, path). We do not collect or use it.
`<OWNER, hard stop: confirm the Cloudflare account has no Web Analytics, Zaraz, Logpush or other
log retention for this hostname, then state Cloudflare's standard log retention here.>`

Actions you start: Download saves the export to your device; Share hands the file to your
operating system's share sheet (where it goes is your choice); the source link opens GitHub in a
new tab without a referrer, and GitHub's own policy applies there.

When embedded, the tool receives only theme and language from the portal and sends one message,
`taro:ready`, with no content.

## Your choices and rights
Nothing is collected, so there is nothing to access, correct or delete. Clear site data in your
browser to remove the offline copy. `<LEGAL: add jurisdiction-specific rights text (GDPR, Vietnamese
law, etc.) and children's-data wording as counsel advises.>`

## Changes and contact
`<OWNER/LEGAL: change policy and contact>`
