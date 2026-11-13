import { afterEach, describe, expect, it } from 'vitest';
import { parseInput } from '../../../../src/commands/agent/tui/ui/keys';
import { box, hang } from '../../../../src/commands/agent/tui/ui/layout';
import { diffFrame } from '../../../../src/commands/agent/tui/ui/screen';
import {
  detectColorDepth,
  hardWrap,
  lineWidth,
  plainText,
  sanitize,
  setColorDepth,
  toAnsi,
  truncate,
  wrap,
} from '../../../../src/commands/agent/tui/ui/text';
import { char, key, plain } from './utils';

afterEach(() => setColorDepth(1));

describe('text', () => {
  it('word-wraps spans, keeping styles and breaking long words', () => {
    const lines = wrap(
      [
        { text: 'hello ' },
        {
          text: 'bold world',
          style: { bold: true },
        },
        { text: ' abcdefghij' },
      ],
      8
    );
    expect(lines.map(plainText)).toEqual([
      'hello',
      'bold',
      'world',
      'abcdefgh',
      'ij',
    ]);
    expect(lines[1]![0]!.style).toEqual({ bold: true });
    expect(wrap([{ text: 'a\n\nb' }], 10).map(plainText)).toEqual([
      'a',
      '',
      'b',
    ]);
  });

  it('measures wide characters in cells', () => {
    expect(wrap([{ text: '日本語のテキスト' }], 6).map(plainText)).toEqual([
      '日本語',
      'のテキ',
      'スト',
    ]);
    expect(lineWidth([{ text: '日本' }])).toBe(4);
  });

  it('truncates with an ellipsis and hard-wraps editable text', () => {
    expect(plainText(truncate([{ text: 'abcdef' }, { text: 'ghij' }], 6))).toBe(
      'abcde…'
    );
    expect(plainText(truncate([{ text: 'abc' }], 6))).toBe('abc');
    expect(
      hardWrap(
        [
          { text: 'ab ' },
          {
            text: ' ',
            style: { inverse: true },
          },
        ],
        2
      ).map(plainText)
    ).toEqual(['ab', '  ']);
  });

  it('strips control sequences from untrusted text', () => {
    expect(sanitize('\u001B[31mred\u001B[0m\tx\r')).toBe('red  x');
  });

  it('writes ANSI for the color depth, keeping attributes without color', () => {
    const line = [
      {
        text: 'a',
        style: { color: '#8f8f8f', bold: true },
      },
    ];
    setColorDepth(3);
    expect(toAnsi(line)).toBe('\u001B[1;38;2;143;143;143ma\u001B[0m');
    setColorDepth(2);
    expect(toAnsi(line)).toBe('\u001B[1;38;5;245ma\u001B[0m');
    setColorDepth(1);
    expect(
      toAnsi([
        {
          text: 'a',
          style: { color: 'blue' },
        },
      ])
    ).toBe('\u001B[34ma\u001B[0m');
    setColorDepth(0);
    expect(
      toAnsi([
        {
          text: 'a',
          style: { color: 'blue', inverse: true },
        },
      ])
    ).toBe('\u001B[7ma\u001B[0m');
  });

  it('detects color depth from the environment', () => {
    expect(detectColorDepth({ COLORTERM: 'truecolor' }, true)).toBe(3);
    expect(detectColorDepth({ TERM: 'xterm-256color' }, true)).toBe(2);
    expect(detectColorDepth({ TERM: 'xterm' }, true)).toBe(1);
    expect(detectColorDepth({ NO_COLOR: '1' }, true)).toBe(0);
    expect(detectColorDepth({ FORCE_COLOR: '2' }, false)).toBe(2);
  });
});

describe('layout', () => {
  it('hangs content beside a prefix and boxes it', () => {
    expect(
      plain(
        hang([{ text: '> ' }], 8, w => wrap([{ text: 'one two three' }], w))
      )
    ).toBe('> one\n  two\n  three');
    expect(plain(box(8, {}, () => [[{ text: 'hi' }]]))).toBe(
      '╭──────╮\n│ hi   │\n╰──────╯'
    );
  });
});

describe('parseInput', () => {
  it('reads text runs, control keys and Alt combinations', () => {
    expect(parseInput('hi\r\u007F\t\u0003').events).toEqual([
      char('hi'),
      key('return'),
      key('backspace'),
      key('tab'),
      char('c', { ctrl: true }),
    ]);
    expect(parseInput('\u001Bb\u001B\r').events).toEqual([
      char('b', { meta: true }),
      key('return', { meta: true }),
    ]);
    expect(parseInput('\n').events).toEqual([key('return', { shift: true })]);
  });

  it('reads CSI and SS3 keys with modifiers', () => {
    expect(
      parseInput('\u001B[A\u001B[1;5C\u001B[5~\u001B[3~\u001BOH\u001B[Z').events
    ).toEqual([
      key('up'),
      key('right', { ctrl: true }),
      key('pageup'),
      key('delete'),
      key('home'),
      key('tab', { shift: true }),
    ]);
  });

  it('reads kitty keyboard protocol keys and ignores releases', () => {
    expect(
      parseInput('\u001B[13;2u\u001B[99;5u\u001B[27u\u001B[97;1:3u').events
    ).toEqual([
      key('return', { shift: true }),
      char('c', { ctrl: true }),
      key('escape'),
    ]);
  });

  it('reads bracketed paste, waiting for its end', () => {
    expect(parseInput('\u001B[200~a\r\nb\u001B[201~x').events).toEqual([
      { kind: 'paste', text: 'a\nb' },
      char('x'),
    ]);
    expect(parseInput('\u001B[200~half')).toEqual({
      events: [],
      rest: '\u001B[200~half',
    });
  });

  it('reads mouse presses and wheel turns, ignoring the rest', () => {
    expect(
      parseInput(
        '\u001B[<0;12;5M\u001B[<0;12;5m\u001B[<64;1;1M\u001B[<65;2;3M\u001B[<2;1;1M'
      ).events
    ).toEqual([
      {
        kind: 'mouse',
        action: 'press',
        x: 11,
        y: 4,
      },
      {
        kind: 'mouse',
        action: 'wheel-up',
        x: 0,
        y: 0,
      },
      {
        kind: 'mouse',
        action: 'wheel-down',
        x: 1,
        y: 2,
      },
    ]);
  });

  it('drops terminal replies and keeps unfinished sequences for later', () => {
    expect(parseInput('a\u001B]11;rgb:0/0/0\u0007b').events).toEqual([
      char('a'),
      char('b'),
    ]);
    expect(parseInput('a\u001B')).toEqual({
      events: [char('a')],
      rest: '\u001B',
    });
    expect(parseInput('\u001B[1;')).toEqual({ events: [], rest: '\u001B[1;' });
    expect(parseInput('\u001B\u001B').events).toEqual([key('escape')]);
  });
});

describe('diffFrame', () => {
  it('rewrites only the rows that changed', () => {
    expect(diffFrame(['a', 'b'], ['a', 'c'])).toBe('\u001B[2;1Hc\u001B[K');
    expect(diffFrame([], ['x'])).toBe('\u001B[1;1Hx\u001B[K');
  });
});
