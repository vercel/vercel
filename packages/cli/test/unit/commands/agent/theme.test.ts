import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import {
  backgroundFromEnv,
  parseBackgroundReply,
  queryBackground,
} from '../../../../src/commands/agent/tui/background';
import {
  applyGrayScale,
  color,
  supportsGrayScale,
} from '../../../../src/commands/agent/tui/theme';

const ansi = { ...color };
afterEach(() => {
  Object.assign(color, ansi);
});

describe('gray scale', () => {
  it('needs a 256-color or truecolor terminal', () => {
    expect(supportsGrayScale({ COLORTERM: 'truecolor' })).toBe(true);
    expect(supportsGrayScale({ TERM: 'xterm-256color' })).toBe(true);
    expect(supportsGrayScale({ TERM: 'xterm' })).toBe(false);
    expect(supportsGrayScale({ TERM: 'xterm-256color', NO_COLOR: '1' })).toBe(
      false
    );
  });

  it('swaps the single gray for three levels per background', () => {
    expect(new Set([color.muted, color.subtle, color.border]).size).toBe(1);
    applyGrayScale('dark');
    expect(new Set([color.muted, color.subtle, color.border]).size).toBe(3);
    expect(color.border).toBe('#454545');
    applyGrayScale('light');
    expect(color.muted).toBe('#4d4d4d');
  });
});

describe('background', () => {
  it('reads OSC 11 replies with any channel width', () => {
    expect(parseBackgroundReply('\u001B]11;rgb:1e1e/1e1e/1e1e\u0007')).toBe(
      'dark'
    );
    expect(parseBackgroundReply('\u001B]11;rgb:ff/ff/ff\u001B\\')).toBe(
      'light'
    );
    expect(parseBackgroundReply('nope')).toBeUndefined();
  });

  it('falls back to COLORFGBG', () => {
    expect(backgroundFromEnv({ COLORFGBG: '15;0' })).toBe('dark');
    expect(backgroundFromEnv({ COLORFGBG: '0;15' })).toBe('light');
    expect(backgroundFromEnv({})).toBeUndefined();
  });

  it('asks the terminal and gives up on silence', async () => {
    const input = Object.assign(new PassThrough(), {
      isTTY: true,
      setRawMode: () => {},
    });
    const asked: string[] = [];
    const answer = queryBackground(input, {
      write: (text: string) => {
        asked.push(text);
        input.write('\u001B]11;rgb:ffff/ffff/ffff\u0007');
      },
    });
    expect(await answer).toBe('light');
    expect(asked).toEqual(['\u001B]11;?\u0007']);
    expect(
      await queryBackground(
        input,
        {
          write: () => {},
        },
        20
      )
    ).toBeUndefined();
  });
});
