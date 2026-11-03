---
id: MOD-Copy
title: Copy — generated string catalog and language formatting
status: draft
depends_on: []
---

## Responsibility
The typed `en-US` / `vi-VN` catalog generated from `copy.md`, the active-language signal, and
number, duration, size and plural formatting per RULE-18. Notices store a COPY id plus raw values
and are formatted when shown, so a language switch re-renders them.

## Not responsible for
- Choosing the language (MOD-Host).

## Public surface
- `t(id, params)`, `formatNumber`, `formatDuration`, `formatTimecode(µs, rate)`, `formatMB`.

## Implements
F-022.R1/R4/R5; RULE-18; INV-05. Decided by ADR-0002.
