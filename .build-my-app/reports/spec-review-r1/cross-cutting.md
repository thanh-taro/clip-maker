# Reviewer: cross-cutting (round 1)
B1 frame time rounding vs µs vs 0.1 s minimums → frame k at floor(k*1e6/rate); minimums round up to whole frames; cumulative snapping.
B2 RULE-22 vs F-023 slow device (dup of F019-F023 B1).
M3 length cap exceeded by reorder/crossfade removal/duplicate/frame-rate rounding → refuse with length_full.
M4 schema kind-conditionals; additionalProperties; speed multipleOf 0.05.
M5 text x/y coordinate system → centre fraction from top-left, default (0.5,0.8).
M6 model clip length formula duplicate → reference RULE-05/06.
M7 audio placement ambiguity (dup of F001 M5) → start=playhead or first free; end cut at next clip; refuse <0.1 s.
M8 RULE-08 full-range clause untestable → ΔE<1 at neutral; 256-step ramp no merges except clipping.
M9 privacy copy overpromise re leftover scratch; VI fix.
M10 NFR-01 vs NFR-10 → requests only own files from own origin; never carry media.
M11 copy gaps (reasons, size target, needs clip, missing items, background/original/blur, quality, typeface/style/align names, GIF settings).
M12 glossary Frame definition; exposure→brightness.
m13 NFR-04 two bars. m14 NFR-02 measurable. m15 GIF default range. m16 VI duplicate "Vừa khung". m17 default box colour; fade clamp.
Owner: A keyframes non-goal vs M-3; B 5K screen recordings refused by 4096 limit (rec accept up to 5120x2880 downscaled); C bundled track entity (rec add).
