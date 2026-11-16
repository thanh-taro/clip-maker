// MOD-Timeline — the audio lane's geometry (F-011): boxes at the ruler scale, the hatched part past the
// project end (INV-07), and the start a drag asks for (then placed by MOD-Project's RULE-12 move rule).
import { describe, expect, it } from 'vitest';
import { audioBoxes, audioDragStart } from '../../src/timeline/geometry';
import { moveAudio } from '../../src/project';
import { audio, proj, S, video } from '../support/project';

describe('MOD-Timeline audio lane', () => {
  it('INV-07 CMP-Timeline an audio clip running past the project end shows the rest hatched from the end', () => {
    const p = proj({ clips: [video('a', 20)], audioClips: [audio('m', 3, 63), audio('n', 1, 2)] });
    const scale = 10 / S; // 10 px per second
    const [m, n] = audioBoxes(p, scale);
    expect(m!.x).toBeCloseTo(30, 6);
    expect(m!.width).toBeCloseTo(600, 6);
    expect(m!.pastEndX).toBeCloseTo(170, 6);
    expect(n!.x).toBeCloseTo(10, 6);
    expect(n!.pastEndX).toBeNull();
  });

  it('F-011.AC2 RULE-12 a drag of the 0–5 s clip to start at 6 s asks for 6 s, and the move rule places it at 3–8 s', () => {
    const p = proj({ clips: [video('a', 30)], audioClips: [audio('m', 0, 5), audio('n', 8, 12)] });
    const scale = 10 / S;
    const requested = audioDragStart(0, 60, scale, 30);
    expect(requested).toBe(6 * S);
    const moved = moveAudio(p, 'm', requested).project.audioClips.find((a) => a.id === 'm')!;
    expect([moved.start, moved.start + moved.out - moved.in]).toEqual([3 * S, 8 * S]);
    // Never before 0, always a frame start.
    expect(audioDragStart(S, -500, scale, 30)).toBe(0);
    expect(audioDragStart(0, 1.234, scale, 25)).toBe(120_000);
  });
});
