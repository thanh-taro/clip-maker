---
id: SCR-Unsupported
title: Unsupported device
status: ready
features: [F-023]
components: [CMP-StatusBar]
---

## Purpose
Explains that this browser or device can't edit video, and what to use instead (PRN-07).

## Layout regions
1. Message: COPY-unsupported.title and COPY-unsupported.body, listing what's missing.
2. CMP-StatusBar.

## States
| State | When | What the user sees |
|---|---|---|
| default | The start-up check failed (RULE-22) | Message and what's missing |

## Entry & exit
- Entered from: opening the tool.
- Exits to: none; the user opens the tool in another browser.

## Accessibility
The heading is focused on load.
