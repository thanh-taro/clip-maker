// MOD-App — the frame section's choices (F-012): aspect, frame rate and background as one RULE-13 undo
// step each through MOD-Project, with RULE-03's result notices. MOD-Project's operations themselves are
// tested in project.items.test.ts; the section's rendering and pixels in tests/e2e/frame.spec.ts.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ASPECT_CHOICES,
  BACKGROUND_CHOICES,
  chooseAspect,
  chooseBackground,
  chooseRate,
  frameSectionShown,
  frameSettings,
  RATE_CHOICES,
} from '../../src/app/frame';
import { notices, resetNotices } from '../../src/app/notice-stack';
import { DEFAULT_PLACEMENT, layoutOf, PALETTE, projectEnd, snapToFrame, type Project } from '../../src/core';
import { addMedia, canUndo, edit, history, newProject, project, selection, undo } from '../../src/project';
import { S, audio, photo, proj, text, video, videoSource } from '../support/project';

const load = (p: Project) => {
  newProject();
  edit(() => ({ project: p, notices: [], changed: [] }));
};
const steps = () => history.value.past.length;

beforeEach(() => {
  newProject();
  resetNotices();
});

describe('F-012 the frame section (MOD-App)', () => {
  it('F-012.R1 F-012.R2 F-012.R3 the section offers the RULE-04 aspects, rates and backgrounds in the board order', () => {
    expect(ASPECT_CHOICES).toEqual(['9:16', '1:1', '4:5', '16:9', 'original']);
    expect(RATE_CHOICES).toEqual([24, 25, 30, 60]);
    // The ten palette swatches (RULE-11 order), then Blur.
    expect(BACKGROUND_CHOICES).toEqual([...PALETTE, 'blur']);
    expect(frameSettings.value).toMatchObject({ aspect: 'original', frameRate: 30, background: 'black' });
  });

  it('F-012.R1 picking an aspect changes the frame in one undo step and keeps every clip’s placement', () => {
    load(
      proj({ clips: [video('A', 4, { placement: { ...DEFAULT_PLACEMENT, mode: 'fill', scale: 150, offsetX: 0.1 } })] }),
    );
    const before = project.value;
    const n = steps();
    expect(chooseAspect('9:16')).toBe(true);
    expect(project.value.frame.aspect).toBe('9:16');
    expect(frameSettings.value.aspect).toBe('9:16');
    expect(project.value.clips).toBe(before.clips);
    expect(steps()).toBe(n + 1);
    // Picking the aspect already chosen changes nothing and makes no step.
    expect(chooseAspect('9:16')).toBe(false);
    expect(steps()).toBe(n + 1);
  });

  it('F-012.AC4 9:16 → 1:1 then undo gives 9:16 with every clip, text layer and audio clip unchanged', () => {
    load(
      proj({
        clips: [video('A', 4), photo('P', 3)],
        textLayers: [text('T', 0.5, 2)],
        audioClips: [audio('M', 0, 5)],
      }),
    );
    chooseAspect('9:16');
    const nineSixteen = project.value;
    const items = JSON.stringify([nineSixteen.clips, nineSixteen.textLayers, nineSixteen.audioClips]);
    chooseAspect('1:1');
    expect(project.value.frame.aspect).toBe('1:1');
    expect(JSON.stringify([project.value.clips, project.value.textLayers, project.value.audioClips])).toBe(items);
    undo();
    expect(project.value).toBe(nineSixteen);
    expect(project.value.frame.aspect).toBe('9:16');
    expect(JSON.stringify([project.value.clips, project.value.textLayers, project.value.audioClips])).toBe(items);
  });

  it('F-012.R2 picking a frame rate is one undo step, marks the rate chosen, and keeps edits on whole frames', () => {
    load(proj({ clips: [video('A', 2.5), photo('P', 1.1)], textLayers: [text('T', 0.1, 1)] }));
    const n = steps();
    expect(chooseRate(24)).toBe(true);
    expect(project.value.frame).toMatchObject({ frameRate: 24, frameRateChosen: true });
    expect(steps()).toBe(n + 1);
    // Every time is a frame start at 24 fps.
    const onFrame = (us: number) => snapToFrame(us, 24) === us;
    expect(onFrame(project.value.textLayers[0]!.start)).toBe(true);
    expect(onFrame(projectEnd(project.value))).toBe(true);
    expect(layoutOf(project.value).frames).toBeGreaterThan(0);
    undo();
    expect(project.value.frame.frameRate).toBe(30);
    expect(canUndo.value).toBe(true); // only the load step is left
  });

  it('F-012.R3 picking a colour or Blur sets the background in one undo step each', () => {
    load(proj({ clips: [video('A', 2)] }));
    const n = steps();
    expect(chooseBackground('yellow')).toBe(true);
    expect(project.value.frame.background).toBe('yellow');
    expect(chooseBackground('blur')).toBe(true);
    expect(project.value.frame.background).toBe('blur');
    expect(steps()).toBe(n + 2);
    undo();
    expect(project.value.frame.background).toBe('yellow');
  });

  it('F-012.R4 frame changes never remove clips, text or audio', () => {
    load(
      proj({ clips: [video('A', 3), photo('P', 2)], textLayers: [text('T', 0, 1)], audioClips: [audio('M', 0, 4)] }),
    );
    chooseAspect('4:5');
    chooseRate(60);
    chooseBackground('blur');
    chooseRate(25);
    expect(project.value.clips.map((c) => c.id)).toEqual(['A', 'P']);
    expect(project.value.textLayers.map((t) => t.id)).toEqual(['T']);
    expect(project.value.audioClips.map((a) => a.id)).toEqual(['M']);
  });

  it('F-012.AC5 25 → 24 fps on a full project shortens the video to 14,397 frames and shows COPY-notice.length_limited', () => {
    load(proj({ rate: 25, clips: [photo('P', 0.12), video('V', 599.897)] }));
    expect(layoutOf(project.value).spans.map((s) => s.frames)).toEqual([3, 14_997]);
    expect(chooseRate(24)).toBe(true);
    const spans = layoutOf(project.value).spans;
    expect(spans.map((s) => s.frames)).toEqual([3, 14_397]);
    expect(projectEnd(project.value)).toBe(600 * S);
    expect(notices.value.map((x) => [x.kind, x.tag])).toEqual([['info', 'length_limited']]);
  });

  it('RULE-03 a frame-rate change the last clip cannot absorb is refused with COPY-notice.length_full and makes no step', () => {
    const shorts = Array.from({ length: 20 }, (_, i) => photo(`P${i}`, 0.1));
    load(proj({ clips: [photo('A', 597.9), ...shorts], rate: 60 }));
    const before = project.value;
    const n = steps();
    expect(chooseRate(24)).toBe(false);
    expect(project.value).toBe(before);
    expect(steps()).toBe(n);
    expect(notices.value.map((x) => x.tag)).toEqual(['length_full']);
  });

  it('RULE-04 F-012.R2 picking the rate already shown, before any rate was chosen, is a choice: a later 60 fps video keeps it', () => {
    const n = steps();
    expect(project.value.frame.frameRateChosen).toBeFalsy();
    expect(chooseRate(30)).toBe(true);
    expect(project.value.frame).toMatchObject({ frameRate: 30, frameRateChosen: true });
    expect(steps()).toBe(n + 1);
    // Picking it again changes nothing more.
    expect(chooseRate(30)).toBe(false);
    edit((p) => addMedia(p, [videoSource('v', 4, { frameRate: 60 })], 0, () => 'c1'));
    expect(project.value.frame.frameRate).toBe(30);
  });

  it('CMP-Inspector F-011 the frame section shows unless a main-track clip or an audio clip is selected (a text layer has no section yet)', () => {
    load(proj({ clips: [video('A', 4)], textLayers: [text('T', 0, 1)], audioClips: [audio('M', 0, 2)] }));
    expect(frameSectionShown.value).toBe(true);
    selection.value = ['M'];
    expect(frameSectionShown.value).toBe(false);
    selection.value = ['T'];
    expect(frameSectionShown.value).toBe(true);
    selection.value = ['A'];
    expect(frameSectionShown.value).toBe(false);
    selection.value = [];
    expect(frameSectionShown.value).toBe(true);
  });
});
