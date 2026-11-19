// MOD-App — the add-media controller (F-001): batches from pick, drop and paste checked through
// MOD-Media's intake, applied to the session's project as one RULE-13 step, with progress, cancel,
// the queue before the device check has drawn (build-spec-questions 59) and the result notices
// (CMP-Notice). The probe is a fake; decoding paths run in tests/e2e/add-media.spec.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { layoutOf, projectEnd, type FrameRate, type Source } from '../../src/core';
import { intakeBatch, SourceRegistry, type IntakeItem, type ProbeOutcome } from '../../src/media';
import { canUndo, EMPTY_PROJECT, history, newProject, playhead, project, undo, isEmpty } from '../../src/project';
import { language } from '../../src/copy';
import { device, resetDeviceSession } from '../../src/app/device';
import {
  addFiles,
  cancelAdding,
  configureAdding,
  dropAdding,
  needsClip,
  openPanel,
  placeAgain,
  progress,
  queued,
  refusedFiles,
  removeMedia,
  resetAdding,
  watchSources,
} from '../../src/app/adding';
import { notices, resetNotices } from '../../src/app/notice-stack';
import { virtualNamedFile } from '../support/blobs';
import { S } from '../support/project';

type Kind = Source['kind'];
/** A stand-in for an ImageBitmap whose `close` is watched. */
const fakeBitmap = () =>
  ({ width: 96, height: 54, close: vi.fn() }) as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };
/**
 * File names say what the fake probe finds: `name.<kind>.<seconds>[.mute]` or `name.bad`; a photo gets
 * a bitmap and a video a thumbnail; `.mute` is a video whose sound can't be decoded.
 */
const file = (name: string, size = 1000): File => {
  const f = new File([new Uint8Array(1)], name);
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

function fakeProbe(gate?: (name: string) => Promise<void>) {
  return async (f: File, _rate: FrameRate, signal: AbortSignal): Promise<ProbeOutcome> => {
    await gate?.(f.name);
    signal.throwIfAborted();
    const [, kind, seconds, flag] = f.name.split('.') as [string, Kind | 'bad', string | undefined, string?];
    if (kind === 'bad') return { ok: false, reason: 'reason.unsupported' };
    const duration = kind === 'photo' ? undefined : Math.round(Number(seconds) * S);
    const source: Omit<Source, 'id'> = {
      kind,
      name: f.name,
      bytes: f.size,
      ...(duration !== undefined ? { duration } : {}),
      ...(kind === 'audio' ? { hasSound: true } : { width: 1920, height: 1080 }),
      ...(kind === 'video' ? { frameRate: 30, hasSound: true } : {}),
    };
    return {
      ok: true,
      probed: {
        source,
        details: { format: 'MP4', rotation: 0, scaled: false },
        notices: flag === 'mute' ? ['notice.no_sound'] : [],
        ...(kind === 'photo' ? { bitmap: fakeBitmap() } : {}),
        ...(kind === 'video' ? { thumbnail: fakeBitmap() } : {}),
      },
    };
  };
}

let released: string[] = [];
let ids = 0;
/** The test's source registry, filled the way MOD-Media's `intake` fills the session's. */
let reg = new SourceRegistry();
function useProbe(gate?: (name: string) => Promise<void>) {
  configureAdding({
    intake: async (items, onProgress, signal, ctx) => {
      const r = await intakeBatch(items, {
        ...ctx,
        nextId: () => `s${++ids}`,
        probe: fakeProbe(gate),
        onProgress,
        signal,
      });
      for (const a of r.accepted) reg.add(a);
      return r;
    },
    release: (id) => {
      released.push(id);
      reg.release(id);
    },
  });
}

const shown = () =>
  notices.value.map((n) => [n.kind, n.tag, n.text(), ...(n.items ?? []).map((i) => `${i.name}: ${i.text()}`)]);
const clipStarts = () => layoutOf(project.value).spans.map((s) => s.startFrame);

beforeEach(() => {
  resetDeviceSession();
  device.value = { status: 'supported' };
  newProject();
  resetAdding();
  resetNotices();
  released = [];
  ids = 0;
  reg = new SourceRegistry();
  stopSources = watchSources(reg);
  useProbe();
});
let stopSources: () => void = () => undefined;
afterEach(() => {
  stopSources();
  resetAdding();
  language.value = 'en-US';
});

describe('F-001 adding media (MOD-App controller)', () => {
  it('F-001.AC1 a picked phone video in an empty project is listed and is the only clip on the main track, at 0', async () => {
    await addFiles([file('phone.video.12')]);
    expect(project.value.sources.map((s) => s.name)).toEqual(['phone.video.12']);
    expect(project.value.clips).toHaveLength(1);
    expect(project.value.clips[0]!.sourceId).toBe(project.value.sources[0]!.id);
    expect(clipStarts()).toEqual([0]);
    expect(isEmpty.value).toBe(false);
    expect(shown()).toEqual([['success', 'added', 'Added 1 file']]);
  });

  it('F-001.AC2 two videos, a photo and an MP3 dropped at once: in order on the main track, the MP3 at the playhead', async () => {
    await addFiles([file('first.video.10')]);
    playhead.value = 4 * S;
    await addFiles([file('a.video.3'), file('b.video.2'), file('c.photo'), file('d.audio.30')]);
    const p = project.value;
    expect(p.clips.map((c) => p.sources.find((s) => s.id === c.sourceId)!.name)).toEqual([
      'first.video.10',
      'a.video.3',
      'b.video.2',
      'c.photo',
    ]);
    expect(p.audioClips).toHaveLength(1);
    expect(p.audioClips[0]!.start).toBe(4 * S);
    // The batch is one undo step (RULE-13).
    expect(history.value.past).toHaveLength(2);
  });

  it('F-001.AC3 refused files are named with their reasons in COPY-error.refused_list; the valid video is added', async () => {
    await addFiles([file('IMG_1.bad'), file('holiday.bad'), file('ok.video.4')]);
    expect(project.value.sources.map((s) => s.name)).toEqual(['ok.video.4']);
    expect(shown()).toEqual([
      ['success', 'added', 'Added 1 file'],
      [
        'error',
        'refused_list',
        "Couldn't add:",
        'IMG_1.bad: not a supported video, photo or audio file',
        'holiday.bad: not a supported video, photo or audio file',
      ],
    ]);
    expect(refusedFiles.value.map((r) => r.name)).toEqual(['IMG_1.bad', 'holiday.bad']);
  });

  it('F-001.AC4 a 5 GB file is refused with COPY-reason.too_large and the project is unchanged', async () => {
    const before = project.value;
    const big = virtualNamedFile(new Uint8Array(16), 5 * 1024 ** 3, 'huge.video.30');
    await addFiles([big]);
    expect(project.value).toBe(before);
    expect(canUndo.value).toBe(false);
    expect(shown()).toEqual([['error', 'refused_list', "Couldn't add:", 'huge.video.30: larger than 4 GB']]);
  });

  it('F-001.AC5 a 30 s video added to a 9 min 50 s project is cut to 10 s with COPY-notice.length_limited (info)', async () => {
    await addFiles([file('long.video.590')]);
    resetNotices();
    await addFiles([file('more.video.30')]);
    expect(projectEnd(project.value)).toBe(600 * S);
    expect(shown()).toEqual([
      ['success', 'added', 'Added 1 file'],
      ['info', 'length_limited', 'Shortened to keep the project within 10 minutes.'],
    ]);
  });

  it('F-001.AC6 removing a source from the media panel removes both its clips without gaps; one undo restores both', async () => {
    await addFiles([file('a.video.5'), file('b.video.4')]);
    const a = project.value.sources[0]!.id;
    placeAgain(a);
    expect(project.value.clips.map((c) => c.sourceId).filter((id) => id === a)).toHaveLength(2);
    const before = project.value;
    removeMedia(a);
    expect(project.value.sources.map((s) => s.name)).toEqual(['b.video.4']);
    expect(project.value.clips).toHaveLength(1);
    expect(clipStarts()).toEqual([0]);
    undo();
    expect(project.value).toBe(before);
  });

  it('F-001.AC8 while the second of five files is checked progress shows; cancel keeps only the first; one undo removes it', async () => {
    let release: () => void = () => undefined;
    const second = new Promise<void>((r) => (release = r));
    useProbe((name) => (name.startsWith('2') ? second : Promise.resolve()));
    const files = ['1.video.3', '2.video.3', '3.video.3', '4.video.3', '5.video.3'].map((n) => file(n));
    const batch = addFiles(files);
    await expect.poll(() => progress.value?.position).toBe(2);
    expect(progress.value).toMatchObject({ position: 2, total: 5, name: '2.video.3', done: 1 });
    expect(shown()).toEqual([['progress', 'adding', 'Adding 2 of 5…']]);
    cancelAdding();
    release();
    await batch;
    expect(progress.value).toBeNull();
    expect(project.value.sources.map((s) => s.name)).toEqual(['1.video.3']);
    undo();
    expect(project.value.sources).toEqual([]);
    expect(canUndo.value).toBe(false);
  });

  it('F-001.AC11 a 2-minute MP3 in an empty project goes on the audio track from 0; export stays unavailable with COPY-notice.needs_clip', async () => {
    await addFiles([file('song.audio.120')]);
    expect(project.value.audioClips).toEqual([expect.objectContaining({ start: 0, in: 0, out: 120 * S })]);
    expect(project.value.clips).toEqual([]);
    expect(isEmpty.value).toBe(false);
    expect(needsClip.value).toBe(true);
  });

  it('F-001.AC12 with 100 sources in the project another file is refused with COPY-reason.too_many', async () => {
    await addFiles(Array.from({ length: 100 }, (_, i) => file(`p${i}.photo`)));
    expect(project.value.sources).toHaveLength(100);
    resetNotices();
    await addFiles([file('one-more.video.3')]);
    expect(project.value.sources).toHaveLength(100);
    expect(shown()).toEqual([
      ['error', 'refused_list', "Couldn't add:", 'one-more.video.3: the project already has 100 files'],
    ]);
  });

  it('F-001.AC14 placing a source again adds a clip of the whole source at the end of the main track, as one undo step', async () => {
    await addFiles([file('a.video.5'), file('b.video.4')]);
    const steps = history.value.past.length;
    placeAgain(project.value.sources[0]!.id);
    expect(project.value.clips.map((c) => (c.kind === 'video' ? [c.in, c.out] : null))).toEqual([
      [0, 5 * S],
      [0, 4 * S],
      [0, 5 * S],
    ]);
    expect(history.value.past).toHaveLength(steps + 1);
  });

  it('F-001.R3 a source whose placement is refused stays in the media panel with the placement notice (RULE-01, RULE-03)', async () => {
    await addFiles([file('full.video.600')]);
    resetNotices();
    await addFiles([file('late.photo')]);
    expect(project.value.sources.map((s) => s.name)).toEqual(['full.video.600', 'late.photo']);
    expect(project.value.clips).toHaveLength(1);
    expect(shown()).toEqual([
      ['success', 'added', 'Added 1 file'],
      ['warning', 'length_full', 'That would make the project longer than 10 minutes.'],
    ]);
  });

  it('F-001 edge case a dropped folder is refused with COPY-reason.folder', async () => {
    await addFiles([{ folder: true, name: 'Holiday' } satisfies IntakeItem, file('v.video.2')]);
    expect(project.value.sources).toHaveLength(1);
    expect(shown()[1]).toEqual(['error', 'refused_list', "Couldn't add:", "Holiday: folders can't be added"]);
  });

  it('F-001 edge case videos whose sound cannot be decoded are added silent with one COPY-notice.no_sound naming them all', async () => {
    await addFiles([file('a.video.3.mute'), file('b.video.3'), file('c.video.3.mute')]);
    expect(shown().filter((n) => n[1] === 'no_sound')).toEqual([
      [
        'info',
        'no_sound',
        "a.video.3.mute and c.video.3.mute were added without sound. This browser can't play their audio.",
      ],
    ]);
    language.value = 'vi-VN';
    expect(notices.value.find((n) => n.tag === 'no_sound')!.text()).toBe(
      'Đã thêm a.video.3.mute và c.video.3.mute nhưng không có tiếng. Trình duyệt này không phát được âm thanh của tệp.',
    );
  });

  it('F-001 edge case one silent file reads "was added without sound" (COPY-notice.no_sound, one form)', async () => {
    await addFiles([file('a.video.3.mute')]);
    expect(notices.value.find((n) => n.tag === 'no_sound')!.text()).toBe(
      "a.video.3.mute was added without sound. This browser can't play its audio.",
    );
  });

  it('F-001 CMP-Notice notices of one batch never replace each other (no_sound and length_limited are both info)', async () => {
    await addFiles([file('long.video.595')]);
    resetNotices();
    await addFiles([file('quiet.video.30.mute')]);
    expect(shown().map((n) => n[1])).toEqual(['added', 'no_sound', 'length_limited']);
  });

  it('F-001.R2 when the check itself fails, the files are refused with a reason, never lost', async () => {
    configureAdding({ intake: () => Promise.reject(new Error('worker gone')), release: () => undefined });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await addFiles([file('a.video.2'), file('b.video.2')]);
    error.mockRestore();
    expect(project.value.sources).toEqual([]);
    expect(shown()).toEqual([
      [
        'error',
        'refused_list',
        "Couldn't add:",
        'a.video.2: has no usable picture or sound',
        'b.video.2: has no usable picture or sound',
      ],
    ]);
  });

  it('CMP-MediaPanel while the panel is closed, the refused group holds only the latest batch; while open it adds up', async () => {
    await addFiles([file('one.bad')]);
    await addFiles([file('two.bad')]);
    expect(refusedFiles.value.map((r) => r.name)).toEqual(['two.bad']);
    openPanel();
    await addFiles([file('three.bad')]);
    expect(refusedFiles.value.map((r) => r.name)).toEqual(['two.bad', 'three.bad']);
  });

  it('F-001.R6 cancel while a second batch is queued drops the queued batch too; a later batch still runs', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => (release = r));
    useProbe((name) => (name.startsWith('slow') ? held : Promise.resolve()));
    const first = addFiles([file('done.video.2'), file('slow.video.2')]);
    const second = addFiles([file('queued.video.2')]);
    await expect.poll(() => progress.value?.position).toBe(2);
    expect(queued.value).toBe(1);
    cancelAdding();
    release();
    await Promise.all([first, second]);
    expect(queued.value).toBe(0);
    expect(project.value.sources.map((s) => s.name)).toEqual(['done.video.2']);
    await addFiles([file('later.video.2')]);
    expect(project.value.sources.map((s) => s.name)).toEqual(['done.video.2', 'later.video.2']);
  });

  it('F-001.R6 a second batch waits for the first and becomes its own undo step', async () => {
    await Promise.all([addFiles([file('a.video.2')]), addFiles([file('b.video.2')])]);
    expect(project.value.sources.map((s) => s.name)).toEqual(['a.video.2', 'b.video.2']);
    expect(history.value.past).toHaveLength(2);
  });
});

describe('F-023 build-spec-questions 59: files added before the effect chain has drawn', () => {
  it('F-023.R1 files picked during the check are queued, then accepted once media is accepted', async () => {
    device.value = { status: 'drawing-check' };
    const batch = addFiles([file('early.video.3')]);
    await Promise.resolve();
    expect(project.value.sources).toEqual([]);
    expect(progress.value).toBeNull();
    device.value = { status: 'supported' };
    await batch;
    expect(project.value.sources.map((s) => s.name)).toEqual(['early.video.3']);
  });

  it('RULE-22 files queued during the check are dropped when the device turns out unsupported', async () => {
    device.value = { status: 'drawing-check' };
    const batch = addFiles([file('early.video.3')]);
    device.value = { status: 'unsupported', missing: ['effects'] };
    await batch;
    expect(project.value.sources).toEqual([]);
    expect(notices.value).toEqual([]);
  });
});

describe('ADR-0009 §7 decoded pictures and file references follow the project and its history', () => {
  it('ADR-0009 removing a source frees its bitmap and thumbnail; undo brings it back and rebuilds them lazily', async () => {
    await addFiles([file('pic.photo'), file('clip.video.3')]);
    const [photo, video] = project.value.sources.map((s) => s.id) as [string, string];
    const bitmap = reg.get(photo)!.bitmap as unknown as { close: ReturnType<typeof vi.fn> };
    const thumb = reg.get(video)!.thumbnail as unknown as { close: ReturnType<typeof vi.fn> };
    removeMedia(photo);
    removeMedia(video);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(thumb.close).toHaveBeenCalledOnce();
    expect(reg.get(photo)).toMatchObject({ file: expect.any(File) });
    expect(reg.get(photo)!.bitmap).toBeUndefined();
    const redecode = vi.fn(async () => ({ bitmap: fakeBitmap() }));
    reg.setRedecode(redecode);
    undo();
    undo();
    expect(redecode).not.toHaveBeenCalled(); // lazily: only when something draws it
    const [again] = await Promise.all([reg.load(photo), reg.load(photo)]);
    expect(again!.bitmap).toBeDefined();
    expect(redecode).toHaveBeenCalledOnce();
  });

  it('ADR-0009 INV-01 after undo then a new edit, a source no history step holds is forgotten, File and all', async () => {
    await addFiles([file('keep.video.3')]);
    await addFiles([file('gone.video.3')]);
    const gone = project.value.sources[1]!.id;
    const thumb = reg.get(gone)!.thumbnail as unknown as { close: ReturnType<typeof vi.fn> };
    undo();
    expect(reg.has(gone)).toBe(true); // redo can still bring it back
    placeAgain(project.value.sources[0]!.id); // a new edit discards the redo step
    expect(reg.has(gone)).toBe(false);
    expect(thumb.close).toHaveBeenCalledOnce();
  });

  it('ADR-0009 a checked source the project could not keep is released at once', async () => {
    // A video shorter than the minimum that reached MOD-Project is refused there (RULE-02 too_short).
    await addFiles([file('ok.video.3'), file('tiny.video.0')]);
    expect(released).toHaveLength(1);
    expect(reg.has(released[0]!)).toBe(false);
    expect(reg.size).toBe(1);
    expect(shown().at(-1)).toEqual(['error', 'refused_list', "Couldn't add:", 'tiny.video.0: too short']);
  });

  it('RULE-23 F-018.R3 a batch still being checked when a new project starts is dropped, its checked files released', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => (release = r));
    useProbe((name) => (name.startsWith('slow') ? held : Promise.resolve()));
    const first = addFiles([file('done.video.2'), file('slow.video.2')]);
    const second = addFiles([file('queued.video.2')]);
    await expect.poll(() => progress.value?.position).toBe(2);
    dropAdding();
    newProject();
    release();
    await Promise.all([first, second]);
    expect(project.value).toBe(EMPTY_PROJECT);
    expect(queued.value).toBe(0);
    expect(released).toHaveLength(1); // done.video.2 was checked: its file and pictures are freed
    expect(reg.size).toBe(0);
    // A later batch lands in the new project as usual.
    await addFiles([file('later.video.2')]);
    expect(project.value.sources.map((s) => s.name)).toEqual(['later.video.2']);
  });

  it('RULE-23 a new project forgets every source', async () => {
    await addFiles([file('a.video.3')]);
    newProject();
    expect(reg.size).toBe(0);
  });
});
