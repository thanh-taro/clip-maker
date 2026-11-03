---
id: MOD-Host
title: Host — theme, language, the host contract and the service worker
status: draft
depends_on: [MOD-Core, MOD-Copy]
---

## Responsibility
The suite's host contract: the inline boot script sets theme and language before first paint;
origin- and parent-checked `taro:theme` / `taro:language` messages; one content-free `taro:ready`
(INV-08); never takes focus from the host. Registers the service worker after first render and
reports nothing else (ADR-0015).

## Not responsible for
- Strings (MOD-Copy), assets (MOD-Assets).

## Public surface
- `initHost()` → signals `theme`, `language`; `registerOffline()`.

## Implements
F-019.R1–R6, F-021.R2/R3, F-022.R1–R3; RULE-17, RULE-18; INV-05, INV-08; NFR-09. Decided by ADR-0002, ADR-0014, ADR-0015.
