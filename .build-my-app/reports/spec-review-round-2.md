# Spec review — round 2 (2 reviewers)

**Rules, domain, copy:** 0 blockers, 7 majors, 8 minors. All applied:
- the timeline vs source time split;
- the duration storage formula and minimum rounding;
- the speed-up minimum;
- split shrinking fades;
- `speedPct` as an integer in the schema;
- placement-refused files kept as sources;
- touch scroll during playback;
- glossary, NFR-05 measure, photo size bound and folder reason.

**Features:** 1 blocker, 5 majors, about 15 minors. All applied:
- audio into an empty project, or with the playhead at the end, starts at 0;
- deterministic audio-move rule;
- duration ties round up;
- touch vs pointer convention;
- an AC for the fixed-times rule;
- missing ACs for re-placing a source, text fade, text duplicate/delete, single mute, licence in the picker, colour background, audio export clearing the warning, and new project without confirmation.

**Defaults taken with my recommendation** (D-024 … D-027; the owner confirms at G1):
- a touch scroll during playback pauses and scrubs;
- music added with the playhead at the end starts at 0;
- touch mode is chosen per input;
- an audio clip's original place counts as free when it is moved.
