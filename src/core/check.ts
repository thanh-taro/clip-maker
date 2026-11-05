// MOD-Core — the invariants every completed edit keeps, as a checker (used by tests and debug asserts).
// Implements: INV-03, INV-04, INV-06; RULE-05 minimum lengths; RULE-10 limits; "Frame times".
import type { Project } from './project.gen';
import { audioOverlaps } from './audio';
import { RULE_11 } from './limits';
import { frameStart, framesOf, minDuration, minFrames, nearestFrame } from './time';
import {
  clipFrames,
  crossFadeLimit,
  layoutOf,
  maxClipFadeFrames,
  maxProjectFrames,
  minCrossFadeFrames,
} from './timing';

const onFrame = (t: number, rate: Project['frame']['frameRate']): boolean =>
  frameStart(nearestFrame(t, rate), rate) === t;

/** Every broken invariant, as short messages; empty when the project is consistent. */
export function invariantViolations(project: Project): string[] {
  const out: string[] = [];
  const rate = project.frame.frameRate;
  const { spans, frames } = layoutOf(project);
  if (frames > maxProjectFrames(rate)) out.push(`INV-04 project is ${frames} frames`);
  project.clips.forEach((clip, i) => {
    const n = clipFrames(clip, rate);
    if (n < minFrames(rate)) out.push(`RULE-05 clip ${clip.id} is ${n} frames`);
    if (clip.kind === 'video' && (clip.in ?? 0) < 0) out.push(`RULE-05 clip ${clip.id} starts before its source`);
    const fi = framesOf(clip.fadeIn, rate);
    const fo = framesOf(clip.fadeOut, rate);
    if (fi + fo > n) out.push(`RULE-10 clip ${clip.id} fades exceed its length`);
    if (fi > maxClipFadeFrames(rate) || fo > maxClipFadeFrames(rate)) out.push(`RULE-10 clip ${clip.id} fade > 3 s`);
    if (clip.crossFadeNext > 0) {
      const x = framesOf(clip.crossFadeNext, rate);
      const next = project.clips[i + 1];
      if (!next) out.push(`INV-03 last clip ${clip.id} has a cross-fade`);
      else if (x < minCrossFadeFrames(rate) || x > crossFadeLimit(n, clipFrames(next, rate), rate))
        out.push(`RULE-10 cross-fade after ${clip.id} is ${x} frames`);
    }
    const span = spans[i];
    if (span && span.frames !== n) out.push(`INV-03 layout of ${clip.id}`);
  });
  if (project.textLayers.length > RULE_11.maxLayers) out.push('RULE-11 too many text layers');
  for (const t of project.textLayers) {
    if (!onFrame(t.start, rate) || !onFrame(t.end, rate)) out.push(`frame times: text ${t.id}`);
    if (t.end - t.start < minDuration(rate)) out.push(`RULE-05 text ${t.id} too short`);
  }
  for (const a of project.audioClips) {
    if (!onFrame(a.start, rate)) out.push(`frame times: audio ${a.id}`);
    if (a.out - a.in < minDuration(rate)) out.push(`RULE-05 audio ${a.id} too short`);
    if (a.in < 0) out.push(`RULE-12 audio ${a.id} starts before its source`);
  }
  if (audioOverlaps(project.audioClips)) out.push('INV-06 audio clips overlap');
  return out;
}
