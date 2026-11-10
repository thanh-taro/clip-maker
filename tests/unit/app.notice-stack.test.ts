// MOD-App — the CMP-Notice stack (CMP-Notice "Behavior"): at most 2 show, a newer notice replaces an
// older one of the same kind, an error is never replaced by info, the rest fold into COPY-notice.more,
// and each kind's hide time.
import { describe, expect, it } from 'vitest';
import { hideAfter, pushNotice, stackView, type NoticeEntry, type NoticeKind } from '../../src/app/notice-stack';

let key = 0;
const entry = (kind: NoticeKind, tag: string = kind): NoticeEntry => ({ key: ++key, kind, tag, text: () => tag });
const tags = (xs: readonly NoticeEntry[]) => xs.map((n) => n.tag);

describe('CMP-Notice stack', () => {
  it('F-001 CMP-Notice a newer notice replaces an older one of the same kind; an error is never replaced by info', () => {
    let list: NoticeEntry[] = [];
    list = pushNotice(list, entry('error', 'refused_1'));
    list = pushNotice(list, entry('info', 'length_limited'));
    list = pushNotice(list, entry('success', 'added'));
    list = pushNotice(list, entry('info', 'no_sound'));
    expect(tags(list)).toEqual(['refused_1', 'added', 'no_sound']);
    list = pushNotice(list, entry('error', 'refused_2'));
    expect(tags(list)).toEqual(['added', 'no_sound', 'refused_2']);
  });

  it('F-001 CMP-Notice at most 2 show (newest at the bottom); the rest fold into COPY-notice.more until expanded', () => {
    const list = [entry('success'), entry('warning'), entry('error'), entry('info')];
    expect(stackView(list, false)).toEqual({ shown: list.slice(2), more: 2 });
    expect(stackView(list, true)).toEqual({ shown: list, more: 0 });
    expect(stackView(list.slice(0, 2), false)).toEqual({ shown: list.slice(0, 2), more: 0 });
  });

  it('F-001 CMP-Notice success hides after 4 s, info and warning after a few seconds; errors and progress stay', () => {
    expect(hideAfter('success')).toBe(4000);
    expect(hideAfter('info')).toBe(8000);
    expect(hideAfter('warning')).toBe(8000);
    expect(hideAfter('error')).toBeNull();
    expect(hideAfter('progress')).toBeNull();
  });
});
