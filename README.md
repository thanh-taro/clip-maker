# Clip Maker

A light video editor for the TaroKit portal (Media tools), live at <https://clip-maker.tarokit.app>: clips on a timeline, text, your own music, speed, colour looks and adjustments, short-form frames, and watermark-free MP4, GIF and audio export, on desktop and phone, in English and Vietnamese. It runs embedded in the portal or standalone.

**Nothing leaves your device.** Your videos, photos, audio and projects are read and exported inside the browser; the tool requests only its own files from its own address, its security policy blocks every other connection, and there are no accounts, cookies or analytics. This repository is public so you can check that.

- What it does and why: `specs/` (start with `specs/README.md`); architecture in `specs/40-technical/`.
- Local development, commands and environments: `docs/local-dev.md`. Deployment: `docs/deploy/`.
- Quick start (Node 24, pnpm 11): `pnpm bootstrap`, then `pnpm dev`; `pnpm check` runs every local gate.
- Release notes: `docs/release-notes/`.

## License
PolyForm Strict License 1.0.0 — see `LICENSE`. It covers only this tool's own source; third-party components keep their own licences (`public/third-party-notices.txt`).
