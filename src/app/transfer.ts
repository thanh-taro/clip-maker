// MOD-App — what a drop or a paste hands to intake (F-001.R1, R5; CMP-DropOverlay, CMP-EmptyState).
// Only files are taken, in the order given; a dropped folder becomes a folder item, which MOD-Media
// refuses with COPY-reason.folder without reading it (RULE-01). Text and links are never followed or
// fetched (NFR-01): there is no clipboard permission, only the `paste` event's own data.
import type { IntakeItem } from '../media';

interface EntryLike {
  readonly isDirectory: boolean;
  readonly name: string;
}
interface ItemLike {
  readonly kind: string;
  getAsFile(): File | null;
  webkitGetAsEntry?(): EntryLike | null;
}

/** Implements: CMP-DropOverlay — files (not text or links) are being dragged. */
export function carriesFiles(data: Pick<DataTransfer, 'types'> | null | undefined): boolean {
  return !!data && Array.from(data.types ?? []).includes('Files');
}

/** Implements: F-001.R1, RULE-01 folders — the dropped files in the order given. */
export function itemsFromDrop(data: Pick<DataTransfer, 'items' | 'files'> | null | undefined): IntakeItem[] {
  if (!data) return [];
  const items = Array.from((data.items ?? []) as ArrayLike<ItemLike>).filter((i) => i.kind === 'file');
  if (items.length === 0) return Array.from(data.files ?? []);
  const out: IntakeItem[] = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.() ?? null;
    const f = item.getAsFile();
    if (entry?.isDirectory) out.push({ folder: true, name: entry.name || f?.name || '' });
    else if (f) out.push(f);
  }
  return out;
}

/** Implements: F-001.R1, AC10 — a paste adds its files; text or a link gives nothing (never fetched). */
export function filesFromPaste(data: Pick<DataTransfer, 'files'> | null | undefined): File[] {
  return data ? Array.from(data.files ?? []) : [];
}

/** A paste aimed at a text field belongs to the field. */
export function pasteTargetsField(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; type?: string; isContentEditable?: boolean } | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && !['file', 'button', 'checkbox', 'radio', 'range', 'submit'].includes(el.type ?? '');
}

/**
 * RULE-20 Mod+V: how many pastes have brought files so far. The F-007 key binder (./adjust.ts) pastes the
 * copied colour only when its key's own `paste` event brought none (files are added as media instead).
 */
export const pastes = { files: 0 };
