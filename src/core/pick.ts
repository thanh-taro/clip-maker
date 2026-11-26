// MOD-Core — colour replace's pick mode start frame (RULE-25 *Pick mode*, F-028), pure: shared by MOD-App (which
// moves the playhead) and the tests. MOD-Plan's `pickPlan` is the picture pick mode paints.
import { layoutOf } from './timing';
import { frameStart } from './time';
import type { Project } from './project.gen';

/**
 * Implements: RULE-25 *Pick mode* (F-028.R2, AC5) — the frame pick mode shows: the playhead frame `k` when it is on the
 * clip; otherwise the clip's first frame at or after the end of its fade in and of any cross-fade into it, or the
 * clip's last frame if that is earlier. Null when the clip is not on the main track.
 */
export function pickStartFrame(project: Project, clipId: string, k: number): number | null {
  const i = project.clips.findIndex((c) => c.id === clipId);
  const span = layoutOf(project).spans[i];
  const clip = project.clips[i];
  if (!span || !clip) return null;
  if (k >= span.startFrame && k < span.endFrame) return k;
  const rate = project.frame.frameRate;
  const start = frameStart(span.startFrame, rate);
  // The first frame whose start is at or after the fade in's end (its opacity is 1, RULE-10).
  let afterFade = span.startFrame;
  while (afterFade < span.endFrame && frameStart(afterFade, rate) < start + clip.fadeIn) afterFade++;
  const xfIn = i > 0 ? (layoutOf(project).spans[i - 1]?.crossFadeFrames ?? 0) : 0;
  return Math.min(Math.max(afterFade, span.startFrame + xfIn), span.endFrame - 1);
}
