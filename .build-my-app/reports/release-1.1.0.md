# Release candidate 1.1.0 (v1.1.0-rc.1)

Date: 2026-11-25 · Commit ff6d0a9 (tag `v1.1.0-rc.1`) · Change: owner decision D-052 (no bundled music; Music opens the user's own audio files). Built with `pnpm release:build v1.1.0-rc.1`.

## Artifact
`release/1.1.0/`: 49 files; 2.0 MB shipped (11.1 MB in 1.0.0), not counting the hidden source maps, which are not uploaded. No audio files ship. Two clean builds are identical for every shipped file; the only difference is in source maps, as in 1.0.0.

## Verification on this Mac
| Check | Result |
|---|---|
| Spec lint, codegen, types, lint, 1088 unit tests, build, licences and dist scan (fails on any shipped audio), size budgets | pass |
| E2E Chromium + WebKit, 1 worker | 978 passed, 13 skipped by design, 1 failed. The failure was intermittent: `keyboard-touch.spec.ts:206` (WebKit, Esc closing the media drawer right after the shortcut list closed). It passed 6/6 on re-run, and the drawer and keyboard code are unchanged by D-052. |
| `pnpm check:realtime` | 17 passed, 1 skipped by design |
| FLOW-01 (now adds the user's own music file through Music), F-011 AC1, AC11–AC16 | pass on both engines |
| `pnpm check:release` (production origins, Trusted Types, no music) | pass |

Device checks remain waived (QA-5).

## SHA-256 of shipped files (maps excluded)
```
1b8443d42793882c83d5467a92a8bdefd6f09af36afebfe856c384c81b5b3488  ./.assetsignore
f96843ff5a1f0efd893fa94c58805a33f8e33d0917f265eb24df2a62ffb9167c  ./.vite/manifest.json
6d0eedc1b938018b17334ceee98c3c4652f8730d9dfe8cd07fdc987ddc17e560  ./_headers
d2a3d1fc90a0fe902480ff8b362b2eb49db909373f928aba786c3c9de8bdff81  ./asset-manifest.json
eb985affa4fa8a3f5595514bc8cf939dd08df08456b93a2859c3d3eca65673cd  ./assets/analysis.worker-D172F7lh.js
d0fa07ff63dd60cbc0e2f58e29c802dca2a5ae0276c999f59c6111ab7bbaec3b  ./assets/anton-latin-400-normal-Byf51wtH.woff2
82cc85bd416dc825c05b4264a8a58e189e528fed8a05fbd471b5493e010d623b  ./assets/anton-vietnamese-400-normal-CkBxLiRJ.woff2
aa40569bdecfa01c38455bc641d4f0010a08eebf5b5d81644de7c25ef5f542fb  ./assets/audio.worker-DWE3PzF_.js
420c33cf7845a2d980f60e055dc66e7824f584876b68cfeeaed629a48ccd48cd  ./assets/bw-classic-B6wjrABb.png
23b59ad7eb25befd6f72ccc1614ee2a1d01e4db01dd7abe81212b07b590ed9ce  ./assets/bw-high-DgC9sch_.png
a71c377e93ab2522b59095d340a3be055a060208aacb21a897192a13be8948fe  ./assets/bw-sepia-R7SLXZA6.png
31f9897e5744dddcd986a1787ea68e63fe8e521ed7905834d6ee64a3a4b46bbf  ./assets/bw-soft-D9KS4mI-.png
e9a561ff58993f5a13d2ce328cc263dcc4dce5433a15f7368a6501e72fd6915c  ./assets/cine-golden-CjhI9oSw.png
d59598927c33c806e9bb549eee6b1aed0928cbf35e116c1363de8b0845c0fede  ./assets/cine-moody-BEsAbKMZ.png
40ef85086a233018a514e931fb78857d5772e1b78f237efcfae90d7093a0a6e7  ./assets/cine-night-D0FDhhma.png
e28b0efa8776ee1f321a22e342eddb1cb546324e949d36dadb47a7a7ef7734ad  ./assets/cine-teal-orange-D1rIdhXP.png
d7a47e2ec8a6bd37096014c825e752891ce292e4db19b4a8b232b806ddb6533d  ./assets/engine.worker-IlsfJ6i7.js
f98f2b4edeff5e7cc777bc9afa36f4838f95e4894d4c3f3cbd694c1397e9c133  ./assets/export-audio.worker-DAtHjRni.js
f4833b8c0e097625c8f86d201c359ac9e94e49a82cd8b57f31cd4dff2662bad8  ./assets/export.worker-C7TPYD2r.js
e319098c66997647cd50e0ef40b3c9948f8b9d5710f348637cbffb789b6b8b8c  ./assets/film-faded-C-iPJfPB.png
a9c9907de48ee06c7fe867c3e9db0b79692de7b54fb216b89a10d9d70b89bb84  ./assets/film-instant-DrpS4HL-.png
75bc14b075ddd206421528db1eab866f11f5215c5a5d4bfcb801201e8592bb90  ./assets/film-pastel-D6HndtxK.png
b359c2fd2e3b64a02b9caf3048617b113d371cccbedacea591f57532cbfc8b73  ./assets/film-retro-CCy-DuQ9.png
7408aaa8092fc2fc85fba23a6463c580022b59d42fed13f3288ae56a6fc71e4d  ./assets/index-CLZ8gGRA.js
0b53ad73c7260c5eb081280f0bc92cefdba2981b50c463641c0044356588a2db  ./assets/index-QgOujMx6.css
18be452724bfdc236c074ca94a249a7f41a86752c7d04ab258ce9ed5651f6a7e  ./assets/jetbrains-mono-latin-wght-normal-B9CIFXIH.woff2
2288795da89dd97e648954b96e22b4501bd85dfc453264460b252f888b582ca2  ./assets/jetbrains-mono-vietnamese-wght-normal-Bt-aOZkq.woff2
a30ddcd349703aff7464c34bef3fffdff405ee50c113440d7c8693c02d210972  ./assets/manrope-latin-wght-normal-DHIcAJRg.woff2
6bbb044ab420e07edb0a3042d2eb314b85e83a0182e945a15ab3b9092668dfd5  ./assets/manrope-vietnamese-wght-normal-usUDDRr7.woff2
5de2965d37c3f8886ed84da86086be52b8cc466afb71c7fecf37d95c70495331  ./assets/natural-cool-tw4sDJFY.png
3c666e9c8c8d6ab822251b0e8d1ba1b5dcb00ed56987ae22012d491921410e93  ./assets/natural-fresh-BJ9VveJ9.png
a43597a409f826f20192ebd52905756dc3fd79a2e42a6b701f60f94ce1c50ed9  ./assets/natural-vivid-D-moUpUT.png
8c1dc13b44c68638d6c5c3545ecb0d4c522281cbf8c1e3f6c68951fb0311eea4  ./assets/natural-warm-CghOZeUq.png
2363d3ed037283ebb961e8c4b4917e40a8bc8853cf9965cf1ea7b4daa1df630a  ./assets/nunito-latin-800-normal-Dz8SOQK_.woff2
fac6740eb7a0d5627c287a8283dd91649f31261c81f4bf965b1403c74fb1fcd8  ./assets/nunito-vietnamese-800-normal-D_CZYdm9.woff2
05db0e784e2dcaea58cc693613728107fdd9064324c711560f7b1ee63f39340e  ./assets/playback.worklet-CThFpp8p.js
28453852ea165c47b5a941be00e418402e1407002ed87507f062a1e316328fe6  ./assets/playfair-display-latin-700-normal-CuDiGg7c.woff2
560402596d5f067fab1884bd39cadedbc8da9b01f85e39f134c06fb4d4472f2d  ./assets/playfair-display-vietnamese-700-normal-CaKJSIny.woff2
534c57bfb8cddcfad114dbc6dc928ef9451bacda8a9cd020205ea893f2384bc3  ./index.html
94eb5f1664703903150680fdfd9d8c152a5ea4e0a2e5d2e5738b598324d1f7c8  ./sw.js
93a9b1f5904f6be547c50eebec1b50c1107ebce4f2301b8164f10bbde700fda1  ./third-party-notices.txt
```
