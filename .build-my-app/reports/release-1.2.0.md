# Release 1.2.0 (v1.2.0-rc.1) and deploy

Date: 2026-11-25 · Commit 74ec727 (tag `v1.2.0-rc.1`, final `v1.2.0`) · Owner decision D-053: colour tools F-024 colour mixer, F-025 colour pop, F-026 split toning, F-027 duotone.

## Verification on this Mac
| Check | Result |
|---|---|
| `pnpm check`: spec lint, codegen, types, lint, unit, build, licences and dist scan, sizes, e2e Chromium + WebKit (1 worker) | all 9 steps passed |
| `pnpm check:realtime` | 18 passed, 1 skipped by design; the SP-colour-tools benchmark (no budget assertion) timed out under software GL and now runs only with `BENCH=1` (ec53be6) |
| Release build twice from the tag | identical shipped files (49 files; maps differ only in bundler placeholder IDs) |
| Phone speed of the colour tools | not measured (QA-5); about +4 ms per 1080p frame by proxy, within the amended ADR-0017 §9 budget |

## Deploy
`pnpm dlx wrangler@4.157.0 deploy --env="" --assets release/1.2.0` → version `18269145-b881-468e-8ff1-fa9955032258` at https://clip-maker.tarokit.app, replacing 1.1.0 (`90671757`).

Live checks: 38 of 38 shipped files byte-identical (three workers and one 1.1.0 page were briefly served by edges mid-switch; all matched 20 s later); CSP equals `_headers`; browser smoke Chromium and WebKit pass (editor open, no errors, no foreign requests, offline worker registered); embedded in the portal at https://tarokit.app/t/clip-maker/ the editor opens in both engines.

Rollback: `pnpm dlx wrangler@4.157.0 rollback 90671757-7117-48df-9798-fc2834450810` (1.1.0, no colour tools).

## SHA-256 of shipped files (maps excluded)
```
1b8443d42793882c83d5467a92a8bdefd6f09af36afebfe856c384c81b5b3488  ./.assetsignore
016cb28d4e41abda4b4d9fa9362195191cc6e946c0114fb5d8cfcaa8b319793c  ./.vite/manifest.json
6d0eedc1b938018b17334ceee98c3c4652f8730d9dfe8cd07fdc987ddc17e560  ./_headers
47f7392954696ef5c17e1c12651f31084d94cb53b6552b6b413d38681b4db6ff  ./asset-manifest.json
5731d70642a85be2e2533a4cf1cff0a3b2f1109a7cc9ea9c98e246147475bc82  ./assets/analysis.worker-R3buoz1H.js
d0fa07ff63dd60cbc0e2f58e29c802dca2a5ae0276c999f59c6111ab7bbaec3b  ./assets/anton-latin-400-normal-Byf51wtH.woff2
82cc85bd416dc825c05b4264a8a58e189e528fed8a05fbd471b5493e010d623b  ./assets/anton-vietnamese-400-normal-CkBxLiRJ.woff2
f2806c3a167d5a951f185f94668cfea8455a7136df22f5c357327f19d634c668  ./assets/audio.worker-DxPrZZjV.js
420c33cf7845a2d980f60e055dc66e7824f584876b68cfeeaed629a48ccd48cd  ./assets/bw-classic-B6wjrABb.png
23b59ad7eb25befd6f72ccc1614ee2a1d01e4db01dd7abe81212b07b590ed9ce  ./assets/bw-high-DgC9sch_.png
a71c377e93ab2522b59095d340a3be055a060208aacb21a897192a13be8948fe  ./assets/bw-sepia-R7SLXZA6.png
31f9897e5744dddcd986a1787ea68e63fe8e521ed7905834d6ee64a3a4b46bbf  ./assets/bw-soft-D9KS4mI-.png
e9a561ff58993f5a13d2ce328cc263dcc4dce5433a15f7368a6501e72fd6915c  ./assets/cine-golden-CjhI9oSw.png
d59598927c33c806e9bb549eee6b1aed0928cbf35e116c1363de8b0845c0fede  ./assets/cine-moody-BEsAbKMZ.png
40ef85086a233018a514e931fb78857d5772e1b78f237efcfae90d7093a0a6e7  ./assets/cine-night-D0FDhhma.png
e28b0efa8776ee1f321a22e342eddb1cb546324e949d36dadb47a7a7ef7734ad  ./assets/cine-teal-orange-D1rIdhXP.png
330569914c0d6a0ab5128128a20ee7e71aa7c36d8df9cb750db15e96cc0dfcae  ./assets/engine.worker-NzXIB7xR.js
80511b78fc60879506a1c55bb7a9f07bedbcb8c173bb2aca2bf04ae498dca6b4  ./assets/export-audio.worker-D1i7OEr2.js
0f57fb35395f395f357124777b10d12360d9d68f8c3567a5540fdf68bac65014  ./assets/export.worker-BahfwQ-X.js
e319098c66997647cd50e0ef40b3c9948f8b9d5710f348637cbffb789b6b8b8c  ./assets/film-faded-C-iPJfPB.png
a9c9907de48ee06c7fe867c3e9db0b79692de7b54fb216b89a10d9d70b89bb84  ./assets/film-instant-DrpS4HL-.png
75bc14b075ddd206421528db1eab866f11f5215c5a5d4bfcb801201e8592bb90  ./assets/film-pastel-D6HndtxK.png
b359c2fd2e3b64a02b9caf3048617b113d371cccbedacea591f57532cbfc8b73  ./assets/film-retro-CCy-DuQ9.png
dddd9e5da40fef0639860c0fc3bdbdfd7cb30923321578fcae90eea496fa01ec  ./assets/index-DGoOhRS6.css
3613b1ce219ade8cd734bb6989549ea7555339df3f556ca1cc4c21ba4e3d6bf5  ./assets/index-DcENk3Gd.js
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
d1d67d3a19a9da6fe13ae0c4fb5de5b2089f634edaf6959ce456517189625606  ./index.html
fa6ddc7d4d4b61d4d7dbff22f0a85d1380dd086924d75ff210f6a7a679574d09  ./sw.js
93a9b1f5904f6be547c50eebec1b50c1107ebce4f2301b8164f10bbde700fda1  ./third-party-notices.txt
```
