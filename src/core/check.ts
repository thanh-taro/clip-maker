// MOD-Core — the invariants every completed edit keeps, as a checker (used by tests and debug asserts).
// Implements: INV-03, INV-04, INV-06; RULE-05 minimums and source bounds; RULE-06 speed steps;
// RULE-10 limits; RULE-12 audio bounds; "Frame times".
// Deliberately recomputes lengths and boundaries from the raw fields instead of reusing the layout
// code it checks (review E1 #9).
import type { Project } from './project.gen';
import { sourceEnd } from './source-end';
import { layoutOf } from './timing';

const US = 1_000_000;

/** Every broken invariant, as short messages; empty when the project is consistent. */
export function invariantViolations(project: Project): string[] {
  const out: string[] = [];
  const rate = project.frame.frameRate;
  // Independent frame maths: frame k starts at floor(k·1e6/rate); n frames ⇔ round(d·rate/1e6).
  const start = (k: number) => Math.floor((k * US) / rate);
  const count = (d: number) => Math.round((d * rate) / US);
  const isFrameStart = (t: number) => t >= 0 && start(count(t)) === t;
  const minLen = Math.ceil(rate / 10); // 0.1 s, rounded up to whole frames
  const minUs = start(minLen);

  // INV-03: end to end from 0, each cross-fade overlapping two neighbours; the length is the end.
  const layout = layoutOf(project);
  let cursor = 0;
  let end = 0;
  const lengths = project.clips.map((c) =>
    c.kind === 'photo'
      ? count(c.duration ?? -1)
      : Math.round((((c.out ?? 0) - (c.in ?? 0)) / ((c.speedPct ?? 100) / 100)) * (rate / US)),
  );
  project.clips.forEach((clip, i) => {
    const n = lengths[i]!;
    const span = layout.spans[i];
    if (!span || span.startFrame !== cursor || span.frames !== n) out.push(`INV-03 layout of ${clip.id}`);
    end = cursor + n;
    const overlap = i < project.clips.length - 1 ? count(clip.crossFadeNext) : 0;
    cursor = end - overlap;
    if (n < minLen) out.push(`RULE-05 clip ${clip.id} is ${n} frames`);
    if (clip.kind === 'video') {
      const inPoint = clip.in ?? -1;
      const outPoint = clip.out ?? -1;
      const srcEnd = sourceEnd(project, clip.sourceId);
      if (inPoint < 0 || outPoint <= inPoint) out.push(`RULE-05 clip ${clip.id} range`);
      if (srcEnd === undefined || outPoint > srcEnd) out.push(`RULE-05 clip ${clip.id} extends beyond its source`);
      const sp = clip.speedPct ?? 0;
      if (sp < 25 || sp > 400 || sp % 5 !== 0) out.push(`RULE-06 clip ${clip.id} speed ${sp}`);
    }
    const fi = count(clip.fadeIn);
    const fo = count(clip.fadeOut);
    if (!isFrameStart(clip.fadeIn) || !isFrameStart(clip.fadeOut)) out.push(`RULE-10 clip ${clip.id} fade frames`);
    if (fi + fo > n) out.push(`RULE-10 clip ${clip.id} fades exceed its length`);
    if (fi > 3 * rate || fo > 3 * rate) out.push(`RULE-10 clip ${clip.id} fade > 3 s`);
    if (clip.crossFadeNext > 0) {
      const next = lengths[i + 1];
      if (next === undefined) out.push(`INV-03 last clip ${clip.id} has a cross-fade`);
      else if (
        overlap < minLen ||
        overlap > 2 * rate ||
        overlap > Math.floor(n / 2) ||
        overlap > Math.floor(next / 2) ||
        !isFrameStart(clip.crossFadeNext)
      )
        out.push(`RULE-10 cross-fade after ${clip.id} is ${overlap} frames`);
    }
  });
  if (layout.frames !== end) out.push(`INV-03 project length ${layout.frames} ≠ ${end}`);
  if (end > 600 * rate) out.push(`INV-04 project is ${end} frames`);

  if (project.textLayers.length > 50) out.push('RULE-11 too many text layers');
  for (const t of project.textLayers) {
    if (!isFrameStart(t.start) || !isFrameStart(t.end)) out.push(`frame times: text ${t.id}`);
    if (t.end - t.start < minUs) out.push(`RULE-05 text ${t.id} too short`);
  }

  for (const a of project.audioClips) {
    const len = a.out - a.in;
    const srcEnd = sourceEnd(project, a.sourceId);
    if (!isFrameStart(a.start)) out.push(`frame times: audio ${a.id}`);
    if (len < minUs) out.push(`RULE-05 audio ${a.id} too short`);
    if (a.in < 0) out.push(`RULE-12 audio ${a.id} starts before its source`);
    if (srcEnd === undefined || a.out > srcEnd) out.push(`RULE-12 audio ${a.id} extends beyond its source`);
    if (a.fadeIn > 5 * US || a.fadeOut > 5 * US) out.push(`RULE-10 audio ${a.id} fade > 5 s`);
    if (a.fadeIn + a.fadeOut > len) out.push(`RULE-10 audio ${a.id} fades exceed its length`);
    if (!isFrameStart(a.fadeIn) || !isFrameStart(a.fadeOut)) out.push(`RULE-10 audio ${a.id} fade frames`);
  }
  // INV-06: sorted by start, each clip ends at or before the next starts.
  const sorted = project.audioClips.slice().sort((x, y) => x.start - y.start);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    if (prev.start + (prev.out - prev.in) > sorted[i]!.start) out.push('INV-06 audio clips overlap');
  }
  return out;
}
