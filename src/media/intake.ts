// MOD-Media — one batch of added files: each checked on its own and in the order given, refusals
// collected with their reasons, progress reported, cancel honoured (F-001.R2/R6, RULE-01 "Several
// files at once"). The caller turns `accepted` into one project step (RULE-13: a batch is one step,
// MOD-Project `addMedia`). Pure orchestration: the probe itself is injected.
import { checkFileSize, checkSourceCount, type FrameRate, type RefusalReason, type Source } from '../core';
import type { ProbedSource, ProbeOutcome } from './types';

/** A dropped folder: never read, refused with COPY-reason.folder (RULE-01). */
export interface FolderItem {
  readonly folder: true;
  readonly name: string;
}
export type IntakeItem = File | FolderItem;

const isFolder = (item: IntakeItem): item is FolderItem => (item as FolderItem).folder === true;

/** A notice about an accepted file (COPY-notice.no_sound), with the source it is about. */
export interface IntakeNotice {
  readonly id: 'notice.no_sound';
  readonly name: string;
  readonly sourceId: string;
}

/** Frees what a probe decoded (a photo's bitmap, a video's thumbnail) when it will not be used. */
export function closeProbed(outcome: ProbeOutcome | null | undefined): void {
  if (!outcome?.ok) return;
  outcome.probed.bitmap?.close();
  outcome.probed.thumbnail?.close();
}

/**
 * RULE-01: a file whose check failed unexpectedly (the analysis worker stopped, an internal error) has
 * no usable picture or sound as far as the tool can tell; the files after it are refused the same way.
 */
export const FAILED_REASON: RefusalReason = 'reason.no_media';

export interface Refusal {
  readonly name: string;
  readonly reason: RefusalReason;
}

export interface AcceptedSource extends ProbedSource {
  readonly source: Source;
  readonly file: File;
}

export interface IntakeResult {
  /** In the order given (RULE-05 adding order). */
  readonly accepted: readonly AcceptedSource[];
  /** For COPY-error.refused_list. */
  readonly refused: readonly Refusal[];
  /** Notices per accepted file (COPY-notice.no_sound with the file name). */
  readonly notices: readonly IntakeNotice[];
  /** True when cancel stopped the batch: the file being checked and the rest were dropped. */
  readonly cancelled: boolean;
}

export interface IntakeProgress {
  /** 1-based position of the file being checked (COPY-media.queue). */
  readonly position: number;
  readonly total: number;
  readonly name: string;
  /** Files whose check has finished. */
  readonly done: number;
}

export interface IntakeOptions {
  /** Sources already in the project (RULE-02: at most 100). */
  readonly sourceCount: number;
  /** The project frame rate ("shorter than one frame", RULE-02). */
  readonly rate: FrameRate;
  readonly nextId: () => string;
  readonly probe: (file: File, rate: FrameRate, signal: AbortSignal) => Promise<ProbeOutcome>;
  readonly onProgress?: (p: IntakeProgress) => void;
  readonly signal?: AbortSignal;
}

const aborted = (signal?: AbortSignal): boolean => signal?.aborted === true;

/**
 * Implements: F-001.R2 (each file checked on its own; refused files named with the reason; accepted
 * ones from the same batch still added), F-001.R6 (progress; cancel keeps the files whose check has
 * finished and drops the one being checked and the rest), RULE-02 too_many and too_large before
 * anything is read.
 */
export async function intakeBatch(items: readonly IntakeItem[], o: IntakeOptions): Promise<IntakeResult> {
  const accepted: AcceptedSource[] = [];
  const refused: Refusal[] = [];
  const notices: IntakeNotice[] = [];
  const signal = o.signal ?? new AbortController().signal;
  let done = 0;
  for (const [i, item] of items.entries()) {
    if (aborted(signal)) return { accepted, refused, notices, cancelled: true };
    o.onProgress?.({ position: i + 1, total: items.length, name: item.name, done });
    const early: RefusalReason | null = isFolder(item)
      ? 'reason.folder'
      : (checkSourceCount(o.sourceCount + accepted.length) ?? checkFileSize(item.size));
    if (early || isFolder(item)) {
      refused.push({ name: item.name, reason: early ?? 'reason.folder' });
      done++;
      continue;
    }
    let outcome: ProbeOutcome;
    try {
      outcome = await o.probe(item, o.rate, signal);
    } catch (e) {
      if (aborted(signal)) return { accepted, refused, notices, cancelled: true };
      // An unexpected failure refuses this file and the rest with a reason; finished ones are kept.
      console.error('intake: check failed', e);
      for (const rest of items.slice(i)) refused.push({ name: rest.name, reason: FAILED_REASON });
      return { accepted, refused, notices, cancelled: false };
    }
    if (aborted(signal)) {
      closeProbed(outcome);
      return { accepted, refused, notices, cancelled: true };
    }
    done++;
    if (!outcome.ok) {
      refused.push({ name: item.name, reason: outcome.reason });
      continue;
    }
    const { probed } = outcome;
    const sourceId = o.nextId();
    accepted.push({ ...probed, source: { ...probed.source, id: sourceId }, file: item });
    for (const id of probed.notices) notices.push({ id, name: item.name, sourceId });
  }
  o.onProgress?.({ position: items.length, total: items.length, name: '', done });
  return { accepted, refused, notices, cancelled: false };
}
