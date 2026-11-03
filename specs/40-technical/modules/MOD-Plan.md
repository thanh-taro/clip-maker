---
id: MOD-Plan
title: Plan — what to draw and play at any project time (pure)
status: draft
depends_on: [MOD-Core]
---

## Responsibility
Turns the project and a time (or a sample range) into the exact recipe that preview and export
both use (INV-02): for a frame, the active main-track clips with the source time that the project
time maps to through the in point and speed ("Source frames" convention), each clip's placement,
grade and look, the layer weights from fades and cross-fades, the background, and the visible text
layers with their fade opacities; for sound, the active voices with source ranges, speed, volume,
mute and gain curves (straight-line fades, equal-power cross-fades). Nothing past the project end
(INV-07).

## Not responsible for
- Decoding, drawing, mixing or timing playback (MOD-Engine, MOD-Compositor, MOD-Audio).

## Public surface
- `framePlan(project, frameIndex)` → `FramePlan`.
- `audioPlan(project, fromSample, count)` → `AudioPlan` at 48 kHz.
- `gifFramePlan(project, gifSettings, i)`; `thumbnailPlan(project, clipId, lookId?)` for RULE-09 thumbnails.

## Implements
F-002.R1/R6, F-005.R2/R3 (timing), F-009 (weights and curves), F-010 (text timing and fades), F-011.R5 (mix recipe), F-016.R1; RULE-04 background behaviour, RULE-06, RULE-09 thumbnails, RULE-10, RULE-12 mix; INV-02, INV-07. Decided by ADR-0006, ADR-0008.
