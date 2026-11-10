// MOD-Copy `formatTimecode(µs, rate)`: the transport's current time as m:ss plus the frame number as a
// separate suffix (COPY-time.position notes, CMP-Preview "default", D-039; F-002.R5).
import { describe, expect, it } from 'vitest';
import { formatTimecode, translate } from '../../src/copy';
import { frameStart } from '../../src/core';

const S = 1_000_000;

describe('MOD-Copy formatTimecode', () => {
  it('F-002.AC5 2 s + 1 frame at 30 fps reads 0:02 with frame ·01', () => {
    expect(formatTimecode(2 * S + frameStart(1, 30), 30, 'en-US')).toEqual({ time: '0:02', frame: '·01' });
    expect(formatTimecode(2 * S, 30, 'en-US')).toEqual({ time: '0:02', frame: '·00' });
  });

  it('F-002.R5 the frame number counts frames inside the second at every project rate', () => {
    expect(formatTimecode(frameStart(4 * 30 + 12, 30), 30, 'en-US')).toEqual({ time: '0:04', frame: '·12' });
    expect(formatTimecode(frameStart(24 + 23, 24), 24, 'en-US')).toEqual({ time: '0:01', frame: '·23' });
    expect(formatTimecode(frameStart(25 * 65 + 3, 25), 25, 'en-US')).toEqual({ time: '1:05', frame: '·03' });
    expect(formatTimecode(frameStart(60 * 9 + 59, 60), 60, 'en-US')).toEqual({ time: '0:09', frame: '·59' });
    // A time inside a frame reads that frame (frame starts are floored, rules.md "Frame times").
    expect(formatTimecode(frameStart(31, 30) + 10, 30, 'en-US')).toEqual({ time: '0:01', frame: '·01' });
  });

  it('F-002.R5 0 and invalid times read 0:00 ·00, in both languages', () => {
    expect(formatTimecode(0, 30, 'vi-VN')).toEqual({ time: '0:00', frame: '·00' });
    expect(formatTimecode(Number.NaN, 30, 'en-US')).toEqual({ time: '0:00', frame: '·00' });
    expect(formatTimecode(-5, 30, 'en-US')).toEqual({ time: '0:00', frame: '·00' });
  });

  it('F-002.R5 COPY-time.position joins the current time and the length', () => {
    expect(translate('en-US', 'time.position', { current: '0:02', length: '0:58' })).toBe('0:02 / 0:58');
    expect(translate('vi-VN', 'time.position', { current: '0:02', length: '0:58' })).toBe('0:02 / 0:58');
  });
});
