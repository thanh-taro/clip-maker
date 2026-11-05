# Spec questions from the build, for the owner at the wave review
From E1 (MOD-Core/Project/Plan). The behaviour currently built is in [brackets].
1. **F-003.AC8:** 9 min 59 s plus 1 s is exactly 600 s, which RULE-03 allows. Proposal: change the AC to 9 min 59.5 s, as F-009.AC6 already uses. [The AC is not cited by a test; the 59.5 s case is tested under RULE-03.]
2. **RULE-03 vs RULE-05:** RULE-03 accepts an add or duplicate when one frame fits, but RULE-05 sets a 0.1 s minimum length. [Refused when less than the minimum fits.] Proposal: make RULE-03 say "when less than the minimum length fits".
3. **Frame-rate change with adjacent audio clips:** after rounding to the new frame grid they can overlap. [The later clip moves to the next free frame start.] Proposal: add this to RULE-04.
4. **Text fade default** is not stated. [Off.] Proposal: state it in RULE-11.
5. **Cross-fade between clips too short to hold 0.1 s:** no behaviour is specified. [Nothing happens.] Proposal: the cross-fade control is unavailable, with a reason.
6. **Speed change stopped by the minimum length:** no notice is specified. [None shown.] Proposal: show COPY-notice.length_limited, or a new "too short for that speed" notice.
7. **RULE-02 "too short":** it refuses sources shorter than one frame, but sources between 1 frame and 0.1 s become 2-frame clips, which breaks RULE-05's 0.1 s minimum. (From the E1 review.) Proposal: refuse sources shorter than the 0.1 s minimum, rounded up to whole frames, with COPY-reason.too_short. [Being built this way, pending your OK.]
