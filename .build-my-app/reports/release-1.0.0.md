# Release candidate 1.0.0 (v1.0.0-rc.1)

Date: 2026-11-25 · Built from the commit tagged `v1.0.0-rc.1` with `pnpm release:build` (`scripts/release-build.sh`: clean git worktree, `pnpm install --frozen-lockfile --offline`, `pnpm build` with the production host list and tool origin, `pnpm check:release`). Nothing is uploaded; deploying is phase 7.

## Artifact
- Directory: `release/1.0.0/` (git-ignored; rebuild with `pnpm release:build v1.0.0-rc.1`). 58 files, 18 MB on disk, including 7 hidden source maps (`*.map`), which `index.html` does not reference. Deploy without the maps unless you decide to publish them.
- Checksums: `release/1.0.0/SHA256SUMS`. They are copied below.
- Reproducibility: two clean builds of the same commit give identical bytes for every shipped file. The only difference is inside one hidden source map, `assets/index-*.js.map`: the bundler writes random internal placeholder IDs into its `sourcesContent`. The code it maps is the same.

## Verification on this Mac, 2026-11-23 to 2026-11-25
| Check | Result |
|---|---|
| `pnpm check` up to e2e (spec lint, codegen, types, lint, 1095 unit, build, licences + dist scan, sizes) | pass (f60de9f) |
| E2E Chromium + WebKit, 1 worker (`pnpm test:e2e --grep-invert @realtime`) | 970 passed, 13 skipped by design, 1 failed. The failure was intermittent: `host-embedded.spec.ts:268` (WebKit), where `?` after `=` on the ruler did not open the help. It then passed 5/5 alone, and passed in the previous full run (bcb735e). The ruler is not re-created by zoom, so focus is kept. Recorded as a load flake. |
| `pnpm check:realtime` | 17 passed, 1 skipped by design |
| FLOW-01 (both tests, both engines) | pass |
| `pnpm check:release`: production `frame-ancestors https://tarokit.app`, Trusted Types, asset CORS `https://clip-maker.tarokit.app`, no placeholder music, dist network scan | pass |
| Production `_headers` has no `X-Robots-Tag`; staging and local builds add `noindex` (ADR-0014) | pass (unit test) |
| Licences: no `personal-only` item in the build; 6 third-party packages ship (preact, @preact/signals, signals-core, gifenc, lucide-static, mediabunny under the ADR-0005 MPL-2.0 exception) | pass |

Device and manual checks are waived by the owner (QA-5) and were not verified on a device. The release notes say so.

## Documents
`docs/release-notes/1.0.0.md` · `docs/release/listing.md` · `docs/legal/privacy-policy.md` and `docs/legal/terms.md` (DRAFT, needs legal review) · `docs/deploy/environments.md` · `docs/deploy/runbook.md` · `.env.example` · `wrangler.jsonc` (`env.staging` is written but not applied).

## Open for the owner, before or in phase 7 (hard stops)
1. A Cloudflare account and the `tarokit.app` zone, plus a wrangler login. All are user-owned. Wrangler itself (DEP-31) is not installed or approved yet.
2. Staging is its own build (`TOOL_ORIGIN=https://clip-maker-staging.tarokit.app`, staging `HOST_ORIGINS`), because origins are compiled in. Production uploads exactly `release/1.0.0/`.
3. Does the portal have a staging origin? It sets the staging `HOST_ORIGINS`.
4. Legal review of the privacy policy and terms. Support URL, operator details, effective dates. Confirm the Cloudflare log settings for the privacy notice.
5. Exact wrangler command lines are left to phase 7. The local-first guard blocks writing them now.

## SHA-256 of shipped files (maps excluded)
```
1b8443d42793882c83d5467a92a8bdefd6f09af36afebfe856c384c81b5b3488  ./.assetsignore
01e176e1cb8cb8f731dfffe1d8f17a48a9a0673299d8228ab1bc5ae1eb385313  ./.vite/manifest.json
6d0eedc1b938018b17334ceee98c3c4652f8730d9dfe8cd07fdc987ddc17e560  ./_headers
fd62f8ceebbdca0416f1c4ab4e595a08e0b73397dc3d74f7c1e3c866fd238d5b  ./asset-manifest.json
eb985affa4fa8a3f5595514bc8cf939dd08df08456b93a2859c3d3eca65673cd  ./assets/analysis.worker-D172F7lh.js
d0fa07ff63dd60cbc0e2f58e29c802dca2a5ae0276c999f59c6111ab7bbaec3b  ./assets/anton-latin-400-normal-Byf51wtH.woff2
82cc85bd416dc825c05b4264a8a58e189e528fed8a05fbd471b5493e010d623b  ./assets/anton-vietnamese-400-normal-CkBxLiRJ.woff2
e8a8a583f2c09dce002d33b9b4cb486f1e241240f9494f1520a4b4f10704ec5b  ./assets/audio.worker-CnV9n1za.js
2223c1d0d750006ec100c39e2f84d504aeb5d15d2d2d0ca72a46100638677817  ./assets/boss-3-B4nl3XWw.m4a
420c33cf7845a2d980f60e055dc66e7824f584876b68cfeeaed629a48ccd48cd  ./assets/bw-classic-B6wjrABb.png
23b59ad7eb25befd6f72ccc1614ee2a1d01e4db01dd7abe81212b07b590ed9ce  ./assets/bw-high-DgC9sch_.png
a71c377e93ab2522b59095d340a3be055a060208aacb21a897192a13be8948fe  ./assets/bw-sepia-R7SLXZA6.png
31f9897e5744dddcd986a1787ea68e63fe8e521ed7905834d6ee64a3a4b46bbf  ./assets/bw-soft-D9KS4mI-.png
09d2c3d961f2858d00969e635f6357c36cdc49c2f821ca20b8c27a5a301e5d4c  ./assets/calm-moment-BNuHQu1u.m4a
e9a561ff58993f5a13d2ce328cc263dcc4dce5433a15f7368a6501e72fd6915c  ./assets/cine-golden-CjhI9oSw.png
d59598927c33c806e9bb549eee6b1aed0928cbf35e116c1363de8b0845c0fede  ./assets/cine-moody-BEsAbKMZ.png
40ef85086a233018a514e931fb78857d5772e1b78f237efcfae90d7093a0a6e7  ./assets/cine-night-D0FDhhma.png
e28b0efa8776ee1f321a22e342eddb1cb546324e949d36dadb47a7a7ef7734ad  ./assets/cine-teal-orange-D1rIdhXP.png
d7a47e2ec8a6bd37096014c825e752891ce292e4db19b4a8b232b806ddb6533d  ./assets/engine.worker-IlsfJ6i7.js
58af59d438036ab005b47ad55cc372be5d0eea9044af6fbec3c2f1f1f74b8548  ./assets/export-audio.worker-DnKDXSFj.js
f4833b8c0e097625c8f86d201c359ac9e94e49a82cd8b57f31cd4dff2662bad8  ./assets/export.worker-C7TPYD2r.js
e319098c66997647cd50e0ef40b3c9948f8b9d5710f348637cbffb789b6b8b8c  ./assets/film-faded-C-iPJfPB.png
a9c9907de48ee06c7fe867c3e9db0b79692de7b54fb216b89a10d9d70b89bb84  ./assets/film-instant-DrpS4HL-.png
75bc14b075ddd206421528db1eab866f11f5215c5a5d4bfcb801201e8592bb90  ./assets/film-pastel-D6HndtxK.png
b359c2fd2e3b64a02b9caf3048617b113d371cccbedacea591f57532cbfc8b73  ./assets/film-retro-CCy-DuQ9.png
81181554f3608efb7a54cb289c5455b6ed354f30944c1f5dd1de71ea5e0a5089  ./assets/go-to-the-picnic-uJAxpna7.m4a
e6257ca320ea172f8d8a6a19908e27a8445f82e0e98cc595e85f32229a713bc1  ./assets/index-BXxjvoW8.css
f095a15e855a091990f58e380e079936b88ea1100f27727f0a532f056c785164  ./assets/index-DkmAioOJ.js
18be452724bfdc236c074ca94a249a7f41a86752c7d04ab258ce9ed5651f6a7e  ./assets/jetbrains-mono-latin-wght-normal-B9CIFXIH.woff2
2288795da89dd97e648954b96e22b4501bd85dfc453264460b252f888b582ca2  ./assets/jetbrains-mono-vietnamese-wght-normal-Bt-aOZkq.woff2
3ee5a06fb3560839180f44d1eab1877290cffaa73e91f98ae3c9fb0f1ec54be8  ./assets/love-train-Bnb-3ZMJ.m4a
7d224356504ccac117453edb559fd5cfc21dc0517bac249f5aa74644f5d323ca  ./assets/lullabies-2-B1Ag4PT7.m4a
a30ddcd349703aff7464c34bef3fffdff405ee50c113440d7c8693c02d210972  ./assets/manrope-latin-wght-normal-DHIcAJRg.woff2
6bbb044ab420e07edb0a3042d2eb314b85e83a0182e945a15ab3b9092668dfd5  ./assets/manrope-vietnamese-wght-normal-usUDDRr7.woff2
5de2965d37c3f8886ed84da86086be52b8cc466afb71c7fecf37d95c70495331  ./assets/natural-cool-tw4sDJFY.png
3c666e9c8c8d6ab822251b0e8d1ba1b5dcb00ed56987ae22012d491921410e93  ./assets/natural-fresh-BJ9VveJ9.png
a43597a409f826f20192ebd52905756dc3fd79a2e42a6b701f60f94ce1c50ed9  ./assets/natural-vivid-D-moUpUT.png
8c1dc13b44c68638d6c5c3545ecb0d4c522281cbf8c1e3f6c68951fb0311eea4  ./assets/natural-warm-CghOZeUq.png
2363d3ed037283ebb961e8c4b4917e40a8bc8853cf9965cf1ea7b4daa1df630a  ./assets/nunito-latin-800-normal-Dz8SOQK_.woff2
fac6740eb7a0d5627c287a8283dd91649f31261c81f4bf965b1403c74fb1fcd8  ./assets/nunito-vietnamese-800-normal-D_CZYdm9.woff2
3cab5ac9810c02bb004228819f1e05585c14fa5a02cb9f41de6af26b2a7e1f37  ./assets/one-cool-minute-CXu1LwPF.m4a
27b7619bc823a761b165b669387043adc81253f59522339d3296b177082b26fb  ./assets/phonk-ish-CSpX9GeP.m4a
05db0e784e2dcaea58cc693613728107fdd9064324c711560f7b1ee63f39340e  ./assets/playback.worklet-CThFpp8p.js
28453852ea165c47b5a941be00e418402e1407002ed87507f062a1e316328fe6  ./assets/playfair-display-latin-700-normal-CuDiGg7c.woff2
560402596d5f067fab1884bd39cadedbc8da9b01f85e39f134c06fb4d4472f2d  ./assets/playfair-display-vietnamese-700-normal-CaKJSIny.woff2
aaa2fb7daf09154e039423738bee7e72e3751fd48362dbdff0916c37fd63ea7e  ./assets/roller-fever-DNlZ6v3Q.m4a
27c2ee30828c40685e68cc56b2a882117b59a9708c7d58b3db546a1fb3f9cfcc  ./assets/snow-drift-C2U1mj1t.m4a
219811f9a0aeeecab4627431c4cdc69d4632d90b9920a28a9c718ec885517da5  ./index.html
2f25737cee156c57f1a27a52fab257c18eae6edb12b16625b9a0912b881e4746  ./sw.js
6b44d277891a010893aee96da840ef7b7aadb9babe5a9ea54198ea1ec8fe43de  ./third-party-notices.txt
```
