# Portal change request: Clip Maker (from phase 3 spikes)

**For:** the TaroKit portal (`taro-kit`)
**From:** Clip Maker. Evidence: SP-frame, SP-ios, SP-storage (`.build-my-app/reports/spike-*.md`)
**Date:** 2026-11-04

## Summary
Clip Maker needs one new frame permission, `share` (the Web Share API, so users can save exports to Photos or send them on), plus a catalog entry. Nothing else changes in the portal's frame contract:
- no cross-origin isolation (COOP/COEP);
- no new sandbox tokens beyond the existing permissions.

## 1. New permission `share` (portal spec RULE-10, ADR-0009, ENT-Tool)
Today a tool embedded with the portal's frame cannot call `navigator.share()`:
- SP-ios measured `navigator.canShare()` as **false** in WebKit and Chrome when the frame's `allow` lacks `web-share`.
- With `allow="web-share"` it is true, and sharing works.

**Change**
- **Portal spec RULE-10 (permission list):** add `share`, meaning "the tool may open the system share sheet (for example, save to Photos)". It adds the Permissions-Policy feature `web-share` and no sandbox token.
- **`src/modules/security-policy/frame.ts`:**
  ```ts
  export const PERMISSIONS = [ /* … */ 'dialogs', 'share' ] as const;
  export const POLICY_FEATURE_FOR = { /* … */ microphone: 'microphone', share: 'web-share' };
  ```
  `headers.ts` then delegates `web-share` in the portal's `Permissions-Policy` only to visible embedded tools that declare it. The existing `POLICY_FEATURES` mechanism already does this.
- **`content/schemas/tool.json`** and the generated `Tool.permissions` type: add `"share"` to the enum.
- **Tests:** a tool with `share` gets `allow="web-share"`. A tool without it gets no `web-share`, and the header lists `web-share` only for declaring tools.
- **Review note (as for `popups` / `dialogs`):** Clip Maker uses it only after the user taps Share on a finished export. The shared file never leaves the device except where the user sends it.

## 2. Catalog entry for Clip Maker
Add it when Clip Maker is deployed (phase 7). Until then, keep it out of the catalog, or add it with `hidden: true` if you want to wire it up early.

`content/tools/clip-maker.yaml`:
```yaml
# yaml-language-server: $schema=../schemas/tool.json
# Clip Maker (taro-kit-tools/media-tools/clip-maker), live at its own address.
id: clip-maker
kind: tool
name: Clip Maker
summary:
  en-US: Cut, join, caption and score your clips right in the browser. Your video never leaves your device, with no watermark and no account.
  vi-VN: Cắt, ghép, chèn chữ và nhạc cho video ngay trong trình duyệt. Video không bao giờ rời khỏi máy bạn, không watermark, không cần tài khoản.
category: media
url: https://clip-maker.tarokit.app/
origin: own
openMode: embedded
permissions: [downloads, file-pick, dialogs, fullscreen, share]
offline: true
sourceUrl: https://github.com/thanh-taro/clip-maker
tags: [video, editor, trim, cut, join, music, text, captions, filters, looks, mp4, gif, tiktok, reels, shorts, video editor, cắt video, ghép video, chỉnh video, chèn nhạc, chèn chữ, bộ lọc màu]
added: 2026-11-04   # set to the real launch date
```

Why each permission:

| Permission | Why | Spec |
|---|---|---|
| `downloads` | Saving MP4, GIF, M4A and WAV exports | F-015, F-016 |
| `file-pick` | Adding media from files (declarative only) | F-001 |
| `dialogs` | The browser's leave-page warning when there are unexported changes | F-018, RULE-19 |
| `fullscreen` | Full-screen preview on desktop. iPhone has no page full screen, so it falls back to maximise-in-page. | F-002.R7 |
| `share` | Share or Save to Photos for a finished export (new, see §1) | F-015 / F-016, SP-ios |

Not needed:
- `clipboard-read`: pasting files uses the `paste` event, with no clipboard permission.
- `clipboard-write`, `popups`, `camera`, `microphone`.

## 3. Things the portal does NOT need to change (for the record)
- **No COOP/COEP.** SP-frame confirmed that workers, WebGL2 in a worker, WebCodecs, AudioWorklet, OPFS and downloads all work in the current frame, embedded and standalone.
- **Focus after the ready signal**, as today (RULE-17).
- **Storage:** WebKit gives an embedded tool about 1/10 of the standalone quota (1.9 GB vs 19.6 GB). Clip Maker handles this itself with its "not enough space" path. Chrome shares storage between same-site embedded and standalone; Clip Maker's scratch naming handles that.
- **Clip Maker's own response headers** (on clip-maker.tarokit.app) set `frame-ancestors https://tarokit.app` and `connect-src 'self'`. That's the tool's side, not the portal's.

## 4. Clip Maker's side (done here, for your information)
Clip Maker's RULE-17 (host contract) will list `web-share` as an **optional** frame grant. Without it, the tool hides Share and offers download only, so the portal can ship this whenever convenient.
