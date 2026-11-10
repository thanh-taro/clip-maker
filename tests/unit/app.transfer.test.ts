// MOD-App — what a drop or a paste hands to intake (F-001.R1, R5): files only, in the order given;
// folders as folder items (COPY-reason.folder); text and links are never followed or fetched.
import { describe, expect, it } from 'vitest';
import { carriesFiles, filesFromPaste, itemsFromDrop, pasteTargetsField } from '../../src/app/transfer';

const file = (name: string) => new File([new Uint8Array(1)], name);

/** A DataTransferItem as a browser hands it over. */
const fileItem = (f: File, directory = false) => ({
  kind: 'file',
  getAsFile: () => f,
  webkitGetAsEntry: () => ({ isDirectory: directory, name: f.name }),
});
const stringItem = () => ({ kind: 'string', getAsFile: () => null, webkitGetAsEntry: () => null });

describe('F-001 drop and paste', () => {
  it('F-001.R1 a drop gives its files in the order given; a folder becomes a folder item', () => {
    const a = file('a.mp4');
    const dir = file('Holiday');
    const b = file('b.jpg');
    const items = itemsFromDrop({
      items: [fileItem(a), stringItem(), fileItem(dir, true), fileItem(b)],
      files: [a, dir, b],
    } as unknown as DataTransfer);
    expect(items).toEqual([a, { folder: true, name: 'Holiday' }, b]);
  });

  it('F-001.R1 a drop without item entries falls back to its file list', () => {
    const a = file('a.mp4');
    expect(itemsFromDrop({ items: [], files: [a] } as unknown as DataTransfer)).toEqual([a]);
  });

  it('F-001.AC10 a pasted file is taken; a clipboard with only text or a link gives nothing to add or fetch', () => {
    const v = file('copied.mp4');
    expect(filesFromPaste({ files: [v], types: ['Files'] } as unknown as DataTransfer)).toEqual([v]);
    const link = {
      files: [],
      types: ['text/plain', 'text/uri-list'],
      getData: () => 'https://example.com/video.mp4',
    } as unknown as DataTransfer;
    expect(filesFromPaste(link)).toEqual([]);
    expect(filesFromPaste(null)).toEqual([]);
  });

  it('CMP-DropOverlay appears only for files, not for dragged text or links', () => {
    expect(carriesFiles({ types: ['Files'] } as unknown as DataTransfer)).toBe(true);
    expect(carriesFiles({ types: ['text/plain', 'text/uri-list'] } as unknown as DataTransfer)).toBe(false);
    expect(carriesFiles(null)).toBe(false);
  });

  it('F-001.R1 a paste into a text field stays with the field', () => {
    expect(pasteTargetsField({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(pasteTargetsField({ tagName: 'INPUT', type: 'text' } as unknown as EventTarget)).toBe(true);
    expect(pasteTargetsField({ tagName: 'INPUT', type: 'file' } as unknown as EventTarget)).toBe(false);
    expect(pasteTargetsField({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(pasteTargetsField({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(pasteTargetsField(null)).toBe(false);
  });
});
