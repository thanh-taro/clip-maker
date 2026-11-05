# Feature map

| ID | Title | Milestone | Priority | Status |
|---|---|---|---|---|
| F-001 | Add media | M-1 | P0 | ready |
| F-002 | Play and scrub the preview | M-1 | P0 | ready |
| F-003 | Arrange clips on the main track | M-1 | P0 | ready |
| F-004 | Trim and split clips | M-1 | P0 | ready |
| F-005 | Change clip speed | M-1 | P1 | ready |
| F-006 | Place, rotate and flip clips | M-1 | P0 | ready |
| F-007 | Adjust colour and light | M-1 | P0 | ready |
| F-008 | Apply a look | M-1 | P0 | ready |
| F-009 | Fade and cross-fade | M-1 | P1 | ready |
| F-010 | Add text | M-1 | P0 | ready |
| F-011 | Add music and set sound | M-1 | P0 | ready |
| F-012 | Set the frame | M-1 | P0 | ready |
| F-013 | Navigate the timeline | M-1 | P1 | ready |
| F-014 | Undo and redo | M-1 | P0 | ready |
| F-015 | Export video | M-1 | P0 | ready |
| F-016 | Export an animated image or audio | M-1 | P2 | ready |
| F-017 | Control by keyboard and touch | M-1 | P1 | ready |
| F-018 | Warn before losing work | M-1 | P1 | ready |
| F-019 | Fit into the host portal | M-1 | P0 | building |
| F-020 | Show the privacy guarantee | M-1 | P1 | building |
| F-021 | Work offline | M-1 | P2 | ready |
| F-022 | Use the portal's language | M-1 | P1 | ready |
| F-023 | Check device support | M-1 | P0 | building |

```mermaid
graph LR
  F-023 --> F-001 --> F-002 & F-003 & F-011 & F-012 & F-014
  F-003 --> F-004 & F-005 & F-006 & F-007 & F-008 & F-009
  F-012 --> F-006
  F-002 --> F-010 & F-013 & F-015 & F-017
  F-004 --> F-017
  F-015 --> F-016
  F-014 --> F-018
  F-019 --> F-021 & F-022
```
