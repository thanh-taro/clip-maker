// MOD-App — looks (F-008): what CMP-LookGallery shows (in CMP-Inspector's Looks tab and the phone Looks sheet)
// and the actions behind it. The rule maths is MOD-Core's (RULE-09: one look or None, intensity 0–100,
// `clampLook`) and MOD-Project's `setLook`; MOD-Compositor applies the look in RULE-08 order with the
// adjustments in the preview and the export alike (INV-02). Choosing is one RULE-13 step; a look preview
// (pointer hover or keyboard focus) is not a step; one intensity movement is one step measured from where it
// began (Q104). The bundled look tables are read by MOD-Assets at start-up after the first render (ADR-0013
// §5) and handed to the engine worker; the export reads the same tables (`lookTables`).
// Implements: F-008.R1 (groups; thumbnails of the RULE-09 frame), F-008.R2 (preview without a step; choose as
// one step), F-008.R3 (intensity), F-008.R4 (adjustments kept), F-008.R5 (None), F-008.R6 (one set of
// tables for preview and export), RULE-09, RULE-13.
import { computed, effect, signal } from '@preact/signals';
import { looks as readLooks, type StripDecoder } from '../assets';
import {
  frameIndexAt,
  layoutOf,
  LOOK_IDS,
  LOOKS,
  RULE_09,
  type LookGroup,
  type LookId,
  type Look,
  type Micros,
  type Project,
  type ToEngine,
} from '../core';
import { beginGesture, edit, project, setLook, type EditResult } from '../project';
import { selectedClip } from './arrange';

// ── the bundled tables (ADR-0013 §5) ─────────────────────────────────────────────────────────────

/** The look tables read so far (33³ RGBA), by look id: the engine's and every export's (INV-02). */
export const lookTables = signal<Readonly<Record<string, Uint8Array>>>({});

/**
 * Implements: ADR-0013 §5, F-008.R6 — reads every look from the tool's own origin (MOD-Assets) and hands the
 * tables to the engine worker. Called at start-up after the first render; called again (the gallery opening)
 * it reads only the looks that failed before.
 */
export async function loadLooks(engine: { postMessage(m: ToEngine): void } | undefined, decode: StripDecoder): Promise<void> {
  const have = lookTables.peek();
  if (LOOK_IDS.every((id) => have[id])) return;
  const got = await readLooks(decode);
  const fresh = got.filter((l) => !lookTables.peek()[l.id]);
  if (!fresh.length) return;
  const tables = Object.fromEntries(fresh.map((l) => [l.id, l.table]));
  lookTables.value = { ...lookTables.peek(), ...tables };
  engine?.postMessage({ type: 'engine:looks', tables });
}

// ── the gallery ──────────────────────────────────────────────────────────────────────────────────

/** RULE-09 groups in looks.md order with their copy ids (CMP-LookGallery group control). */
export const GROUPS: readonly { readonly group: LookGroup; readonly copy: `looks.group_${string}` }[] = [
  { group: 'Natural', copy: 'looks.group_natural' },
  { group: 'Film', copy: 'looks.group_film' },
  { group: 'Cinematic', copy: 'looks.group_cinematic' },
  { group: 'Black & White', copy: 'looks.group_bw' },
];

/** The looks of one group, in looks.md order. */
export const groupLooks = (group: LookGroup): LookId[] => LOOK_IDS.filter((id) => LOOKS[id].group === group);

export interface LookTarget {
  readonly id: string;
  readonly look: Look;
}

/** The selected video or photo clip's look (CMP-LookGallery acts on it), or null. */
export const lookTarget = computed<LookTarget | null>(() => {
  const clip = selectedClip.value;
  return clip ? { id: clip.id, look: clip.look } : null;
});

/** The group the user picked in the gallery (UI state, not an undo step); null: follow the chosen look. */
export const galleryGroup = signal<LookGroup | null>(null);

/** CMP-LookGallery "Behavior": the group shown — the one picked, else the chosen look's, else Natural. */
export const shownGroup = computed<LookGroup>(() => {
  if (galleryGroup.value) return galleryGroup.value;
  const id = lookTarget.value?.look?.id;
  return id && id in LOOKS ? LOOKS[id as LookId].group : 'Natural';
});

// ── choosing and previewing (RULE-09) ────────────────────────────────────────────────────────────

const lookAt100 = (id: string | null): Look => (id === null ? null : { id, intensity: RULE_09.defaultIntensity });

/**
 * Implements: F-008.R2/R5, RULE-09 *Choosing* — a click, tap or Enter chooses `lookId` (null: None) as one
 * undo step, at the default intensity, keeping the clip's adjustments (F-008.R4). Choosing the look the clip
 * already has (or None again) changes nothing and makes no step.
 */
export function chooseLook(clipId: string, lookId: string | null): void {
  const clip = project.peek().clips.find((c) => c.id === clipId);
  // The chosen look is what the preview now shows: the preview gives way to it (its intensity included).
  endLookPreview();
  if (!clip || (clip.look?.id ?? null) === lookId) return;
  edit((p) => setLook(p, clipId, lookAt100(lookId)));
}

/** A look previewed on the selected clip (pointer hover or keyboard focus; preview only), or null. */
export interface LookPreview {
  readonly clipId: string;
  /** The look previewed (null: None). */
  readonly lookId: string | null;
  /** As drawn: at intensity 100 (RULE-09 thumbnails and choosing use the default). */
  readonly look: Look;
}

export const previewing = signal<LookPreview | null>(null);

/**
 * Implements: F-008.R2, RULE-09 — previews `lookId` (null: None) on the selected video or photo clip without
 * an undo step (CMP-Preview draws it; ./Preview.tsx sends it to MOD-Preview). The look the clip already has
 * is shown as it is (at its own intensity), so no preview is needed for it.
 */
export function previewLook(lookId: string | null): void {
  const target = lookTarget.peek();
  if (!target) return;
  if ((target.look?.id ?? null) === lookId) return endLookPreview();
  const now = previewing.peek();
  if (now?.clipId === target.id && now.lookId === lookId) return;
  previewing.value = { clipId: target.id, lookId, look: lookAt100(lookId) };
}

/** Pointer or focus left the looks without choosing: the preview returns to the clip as it is. */
export function endLookPreview(): void {
  previewing.value = null;
}

// The previewed clip stops being the selected one (deselected, deleted, undone): the preview ends.
effect(() => {
  const p = previewing.value;
  if (p !== null && lookTarget.value?.id !== p.clipId) endLookPreview();
});

// ── intensity (RULE-09, F-008.R3) ────────────────────────────────────────────────────────────────

const lookNow = (id: string): Look => project.peek().clips.find((c) => c.id === id)?.look ?? null;

const clampIntensity = (v: number): number =>
  Math.min(RULE_09.maxIntensity, Math.max(RULE_09.minIntensity, Math.round(v)));

/**
 * One control (a typed value, a slider key): one step. Returns the intensity now in effect, or null when the
 * clip has no look (the control is unavailable then, CMP-LookGallery "None").
 */
export function setIntensityOnce(clipId: string, value: number): number | null {
  const look = lookNow(clipId);
  if (!look) return null;
  if (Number.isFinite(value)) edit((p) => setLook(p, clipId, { ...look, intensity: clampIntensity(value) }));
  return lookNow(clipId)?.intensity ?? null;
}

/** One movement of the Intensity slider (F-014 gesture; ./slider-gesture.ts drives it). */
export interface IntensityDrag {
  set(value: number): void;
  end(): void;
  readonly active: boolean;
}

/**
 * Implements: RULE-13 (one slider movement is one step), Q104 (back at its start: no change, no step, redo
 * kept). Each move sets the intensity on the project as it was when the movement began.
 */
export function beginIntensityDrag(clipId: string, onCut: () => void): IntensityDrag {
  const base = project.peek();
  const origin = base.clips.find((c) => c.id === clipId)?.look ?? null;
  let ended = false;
  const gesture = beginGesture(() => {
    ended = true;
    gesture.end();
    onCut();
  });
  return {
    set(value) {
      if (ended || !gesture.active || !origin || !Number.isFinite(value)) return;
      const v = clampIntensity(value);
      gesture.edit(
        (): EditResult =>
          v === origin.intensity
            ? { project: base, notices: [], changed: [] }
            : setLook(base, clipId, { ...origin, intensity: v }),
      );
    },
    end() {
      if (ended) return;
      ended = true;
      gesture.end();
    },
    get active() {
      return !ended && gesture.active;
    },
  };
}

// ── thumbnails (RULE-09) ─────────────────────────────────────────────────────────────────────────

/**
 * RULE-09 *Thumbnails*: the frame index the gallery's thumbnails show — the playhead's when it is inside the
 * clip, otherwise the clip's first frame (MOD-Plan `thumbnailPlan` draws it). Null for a clip not on the track.
 */
export function thumbnailFrame(p: Project, clipId: string, playheadUs: Micros): number | null {
  const i = p.clips.findIndex((c) => c.id === clipId);
  const span = layoutOf(p).spans[i];
  if (i < 0 || !span) return null;
  const k = frameIndexAt(Math.max(0, playheadUs), p.frame.frameRate);
  return k >= span.startFrame && k < span.endFrame ? k : span.startFrame;
}
