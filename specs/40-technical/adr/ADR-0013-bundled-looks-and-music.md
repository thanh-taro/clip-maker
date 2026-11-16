---
id: ADR-0013
title: Bundled looks and music — own look tables, a CC0 music pack in AAC, loaded at the first visit
status: accepted
date: 2026-11-03
supersedes: []
---

## Context
RULE-09 and `30-experience/looks.md`: at least 16 own looks in four groups. RULE-12 and
ENT-MusicTrack: at least 8 public-domain tracks (CC0 or equivalent, D-010) with title, source and
licence shown (F-011.R6), ≤ 10 MB in total (NFR-10), fetched on the first online visit and never
again (NFR-01, D-017, F-011.R7). The tracks must decode on every NFR-12 target through the same
audio path as user files (ADR-0008).

## Decision
1. **Looks**: 16 tables authored in design as `.cube` files (owner's own work, DEP-13), converted
   by the build to 33³ PNG strips (ADR-0007) with a content hash in the file name and a manifest
   entry (id, group, names come from copy.md).
2. **Music format**: AAC-LC in M4A, 48 kHz stereo, 128 kbps (≈ 0.96 MB per minute), loudness
   normalised to about −16 LUFS integrated so tracks sit well under clip sound; 8–10 tracks of
   1–1.5 minutes each, ≤ 10 MB in total. AAC decodes in every target engine's codec API; Opus would
   give about 30 % more music per MB and is the alternative if SP-codec confirms Opus decoding on
   every target. Encoding is an asset-preparation step done once by the owner with a local tool
   that is not shipped (for example the operating system's own AAC converter); the result is
   committed with its checksum.
3. **Candidate sources** (each track audited one by one; nothing is added without its licence
   record):
   - FreePD (all tracks dedicated under CC0 1.0 by their authors);
   - OpenGameArt.org, filtered to CC0;
   - Free Music Archive, filtered to CC0 (per-track licence varies — check each page);
   - Wikimedia Commons audio marked CC0 or public domain (check the recording, not only the
     composition);
   - Musopen recordings explicitly released as public domain.
   Excluded: anything CC-BY (incl. Incompetech), CC-BY-SA, NC or ND, the Pixabay licence, platform
   audio libraries, and "royalty-free" catalogues that need an account.
4. **Registry**: each track is its own row in `dependencies.md` (title, author, source URL,
   licence, date checked, a copy of the licence/dedication page saved with the audit, file
   checksum), and the notices file and the in-tool notices list them (F-020.R4).
5. **Loading**: looks and music are listed in the build-generated asset manifest; MOD-Assets
   reads looks from the tool's own origin at start-up after first render (ADR-0014's
   `connect-src 'self'`), the service worker caches them (ADR-0015), and nothing is fetched on
   first use. Bundled music tracks are hashed build files listed in the asset manifest and
   precached by the service worker on the first online visit; MOD-Assets reads a track when it is
   first auditioned or placed (served from the offline copy), and only if the manifest lists it.
   On the development server, which builds no manifest, the compiled-in music paths stand in for
   it; never in a build. *(Amended 2026-11-16 by the owner, build question 113: music was read "at
   start-up after first render"; reading up to 10 MB on every start would cost memory and start-up
   time for nothing. NFR-01's "the first online visit fetches everything" still holds through the
   precache.)*

## Alternatives considered
- **Opus in Ogg/WebM** — smaller; decoding support on every target's codec API to be confirmed.
- **CC-BY music** — more choice, but D-010 says CC0/public domain only.
- **No bundled music** — owner chose a pack (D-006).

## Consequences
- The owner (or a delegate) must pick, listen to and audit 8+ tracks (legal sign-off per track).
- 10 MB at first visit is the largest part of the offline download; it never delays start-up
  (NFR-02) because it is fetched after the editor is usable.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->

## Outcome (spikes, 2026-11-04)
Evidence: SP-gpu-color, SP-codec.
- **Looks (§1)**: authored 33³ tables stored as 8-bit PNG strips measured 3.7 KB (B&W), 10.1 KB
  (Warm) and 15.1 KB (Teal & Orange); storage error ΔE00 mean 0.08, max 0.78. Rule: budget
  **30 KB per look** (16 ≈ 0.5 MB); the build rejects a look over 108 KB or with storage error above
  ΔE00 1 (ADR-0007 outcome item 3). Fonts + looks stay well inside NFR-10's 1.5 MB.
- **Music (§2)**: AAC-LC in M4A stays. AAC decodes from real packets in Chromium, Chrome, WebKit and
  on the iPhone; Opus decodes everywhere tested too, but AAC needs no further checks and is what the
  owner's local encoder produces. No change.
- Curation follows D-034 (Claude shortlists ~15 CC0 candidates with licence records; the owner keeps
  8–10); not part of the spikes.
