# Market research — local-only browser video editor (CapCut alternative)

Source: market-researcher agent, 2026-11-03. Evidence is mostly secondary blogs from standard-mode searches. Vendor pages were not opened; verify prices live before quoting them.

## Top 5 findings
1. **CapCut's main complaint is paywalls.** One analysis of 2,881 negative US App Store reviews found 900 that mention Pro, paywall or subscription (https://unstar.app/blog/capcut-everything-is-pro-now-cant-export-reviews-2026). Auto-captions are reportedly free only once a month (https://androidauthority.com/i-am-ditching-capcut-3545614). Some users say CapCut blocks export until they upgrade (https://www.sikayetvar.com/en/capcut-us/capcut-now-forces-me-to-upgrade-to-pro-just-to-export-videos-after-4-months-free).
2. **Users distrust CapCut on privacy.** Critics read the June 2025 terms update as a perpetual, irrevocable content license that also allows uploading private drafts. CapCut says the user-content section did not change (https://www.techradar.com/pro/popular-video-editing-app-capcut-wants-to-use-any-content-you-produce-for-free-forever-heres-what-you-should-know, https://larryjordan.com/articles/caution-capcut-changed-their-license-and-may-own-your-content/). A 2023 biometric class action is partly going ahead (https://dev.to/jondavis/capcut-in-2026-a-developers-guide-to-the-ban-status-data-risks-and-migration-paths-16pj).
3. **The US ban risk has eased.** Third-party blogs say the TikTok US joint venture closed on 22 Jan 2026 and covers CapCut, which is back in US stores (https://www.hooked.so/guides/is-capcut-getting-banned). This was not verified against a primary source.
4. **Cloud editors watermark or cap their free tiers.**
   - Kapwing: watermark, 720p, and a per-export length cap that sources give as 1, 4 or 7 minutes (https://morphed.app/blog/kapwing-free-plan-limits).
   - VEED: watermark, 720p, and a cap of about 10 minutes (https://fluxnote.io/guides/veed-io-free-plan-limits-2026).
   - Clipchamp: free 1080p without a watermark, but needs a Microsoft account (https://dupple.com/learn/veed-alternatives, second-hand).
5. **The browser technology is ready.**
   - WebCodecs is in Chromium since v94, Firefox desktop since 130, and Safari 26 including iOS (https://www.digitalsamba.com/blog/webcodecs-api-explained, https://caniuse.com/webcodecs).
   - Mediabunny writes MP4 files in the browser (https://mediabunny.dev/guide/introduction).

## Competitors
| Product | Platform | Pricing / paywall | Watermark (free) | Uploads media? | Notes |
|---|---|---|---|---|---|
| CapCut | desktop, web, mobile | Freemium + Pro; free tier shrinking | No (but export paywalls reported) | Yes for cloud features (https://www.capcut.com/help/features-needs-to-paid) | Templates, captions |
| Clipchamp | web, Windows | Free 1080p | No | Yes | Microsoft account required |
| Canva video | web, apps | Pro $12.99–15/mo (sources conflict) | Only with Pro elements (https://www.canva.com/features/watermark-video/) | Yes | Auto-captions |
| Kapwing | web | Pro ~$16/mo annual | Yes, 720p, length cap | Yes | |
| VEED | web | conflicting | Yes, 720p, ~10 min | Yes | |
| InShot | mobile | Pro $3.99–4.99/mo or ~$35–50 lifetime (https://www.creatorstackclub.com/software/inshot) | Yes + ads | No (device) | No desktop, no auto-captions |
| Omniclip | browser, MIT, WebCodecs | Free | No | No (local) | Trim, split, text, 4K; no transitions/effects; looks stale (https://github.com/omni-media/omniclip) |
| Shotcut / Kdenlive / OpenShot | desktop | Free, open source | No | No | Not researched |
| ffmpeg.wasm tools | browser | Free | — | No | Slow, ~2 GB memory cap, multithreading needs COOP/COEP (https://transloadit.com/devtips/extract-thumbnails-from-videos-in-browsers-with-ffmpeg-wasm/; claims not verified) |

## Praise and most-used features
Evidence here is thin, and no sourced ranking of features by usage exists. CapCut praise centres on templates and captions (https://www.dienmayxanh.com/kinh-nghiem-hay/capcut-la-gi-huong-dan-cach-tai-va-su-dung-capcut-1570217). By inference, not from a cited ranking, the core short-clip set is: trim, split, merge, text, music, speed, aspect ratios, auto-captions, transitions and filters.

## Gaps
- No editor combines all of these: free, no account, no watermark, no upload, and a local-only claim you can verify.
- Omniclip is the only comparable local editor found, and it lacks transitions and effects.

## Limitations (honest)
- Firefox has no AAC encoder, so MP4 audio there needs a workaround (https://www.stormstreaming.com/blog/?p=430).
- Firefox for Android has no WebCodecs (https://caniuse.com/webcodecs).
- Hardware acceleration is only a hint.
- Memory limits, export speed and background-tab throttling have not been measured.
- Codecs must be feature-detected at runtime.

## Licensing / regulatory
- Avoid bundling GPL ffmpeg builds.
- H.264 and AAC patents are covered by using the browser's own encoders. This was not researched in depth.
- Music and fonts need their own licences.
- GDPR and Vietnam regulation were not researched.

## Vietnam
- Vietnam is described as one of CapCut's leading regional markets (https://vietnamnews.vn/life-style/1799360/viet-nam-emerges-as-one-of-capcut-s-leading-regional-markets.html).
- Vietnamese tech press covered the content-rights controversy (https://vnreview.vn/threads/canh-bao-khan-nguoi-dung-capcut-co-the-bi-tuoc-quyen-so-huu-noi-dung-do-chinh-ban-tao-ra.63730/latest).

## Most promising differentiators
1. Privacy you can verify: no upload and no account, with proof that the page makes no network requests.
2. No watermark, no export cap, and no paywalled basics.
3. A Vietnamese and English UI built around short-form presets (9:16 and others).
