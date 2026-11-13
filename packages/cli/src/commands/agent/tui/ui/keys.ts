/**
 * Terminal input as events: keys (legacy sequences and the kitty keyboard protocol), bracketed
 * paste, and SGR mouse reports. Terminal replies (OSC, unknown CSI) are dropped.
 */

export interface KeyEvent {
  kind: 'key';
  /** `return`, `escape`, `backspace`, `delete`, `tab`, `up`, `down`, `left`, `right`, `home`, `end`, `pageup`, `pagedown`, or `char`. */
  name: string;
  /** The typed text, for `char`. */
  text?: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}

interface PasteEvent {
  kind: 'paste';
  text: string;
}

export interface MouseEvent {
  kind: 'mouse';
  action: 'press' | 'wheel-up' | 'wheel-down';
  /** 0-based cell coordinates. */
  x: number;
  y: number;
}

export type InputEvent = KeyEvent | PasteEvent | MouseEvent;

function key(
  name: string,
  mods: Partial<Pick<KeyEvent, 'ctrl' | 'meta' | 'shift' | 'text'>> = {}
): KeyEvent {
  return {
    kind: 'key',
    name,
    ctrl: false,
    meta: false,
    shift: false,
    ...mods,
  };
}

/** xterm modifier parameter: 1 + (shift 1, alt 2, ctrl 4). */
function modifiers(
  param: string | undefined
): Pick<KeyEvent, 'ctrl' | 'meta' | 'shift'> {
  const bits = Math.max(0, (Number(param?.split(':')[0]) || 1) - 1);
  return {
    shift: Boolean(bits & 1),
    meta: Boolean(bits & 2),
    ctrl: Boolean(bits & 4),
  };
}

const CSI_LETTER: Record<string, string> = {
  A: 'up',
  B: 'down',
  C: 'right',
  D: 'left',
  H: 'home',
  F: 'end',
};
const CSI_TILDE: Record<string, string> = {
  1: 'home',
  7: 'home',
  4: 'end',
  8: 'end',
  3: 'delete',
  5: 'pageup',
  6: 'pagedown',
};
const KITTY_KEYS: Record<number, string> = {
  13: 'return',
  9: 'tab',
  27: 'escape',
  127: 'backspace',
};

/** Decode a kitty `CSI codepoint;mods u` key. Release events are ignored. */
function kittyKey(params: string): KeyEvent | undefined {
  const [code, mods = '1'] = params.split(';');
  if (mods.split(':')[1] === '3') return undefined;
  const codepoint = Number(code!.split(':')[0]);
  const flags = modifiers(mods);
  const name = KITTY_KEYS[codepoint];
  if (name) return key(name, flags);
  return key('char', {
    ...flags,
    text: String.fromCodePoint(codepoint),
  });
}

function csiKey(params: string, final: string): KeyEvent | undefined {
  if (final === 'u') return kittyKey(params);
  if (final === 'Z') return key('tab', { shift: true });
  const parts = params.split(';');
  if (final === '~') {
    const name = CSI_TILDE[parts[0] ?? ''];
    return name ? key(name, modifiers(parts[1])) : undefined;
  }
  const name = CSI_LETTER[final];
  return name ? key(name, modifiers(parts[1])) : undefined;
}

function mouseEvent(
  button: number,
  x: number,
  y: number,
  press: boolean
): MouseEvent | undefined {
  if (button === 64 || button === 65) {
    return {
      kind: 'mouse',
      action: button === 64 ? 'wheel-up' : 'wheel-down',
      x: x - 1,
      y: y - 1,
    };
  }
  // Left button, no modifiers or motion.
  if (button === 0 && press) {
    return {
      kind: 'mouse',
      action: 'press',
      x: x - 1,
      y: y - 1,
    };
  }
}

const PASTE_START = '\u001B[200~';
const PASTE_END = '\u001B[201~';

type Sequence = { event?: InputEvent; length: number } | 'incomplete';

function pasteSequence(input: string): Sequence {
  const end = input.indexOf(PASTE_END);
  if (end === -1) return 'incomplete';
  return {
    event: {
      kind: 'paste',
      text: input.slice(PASTE_START.length, end).replace(/\r\n?/g, '\n'),
    },
    length: end + PASTE_END.length,
  };
}

/** `ESC [ …`: a mouse report or a CSI key. `body` is the input after ESC. */
function csiSequence(body: string): Sequence {
  const mouse = /^\[<(\d+);(\d+);(\d+)(M)/i.exec(body);
  if (mouse) {
    return {
      event: mouseEvent(
        Number(mouse[1]),
        Number(mouse[2]),
        Number(mouse[3]),
        mouse[4] === 'M'
      ),
      length: mouse[0].length + 1,
    };
  }
  const csi = /^\[([\d;:<=>?]*)[\x20-\x2F]*([\x40-\x7E])/.exec(body);
  if (csi) {
    return {
      event: csiKey(csi[1]!, csi[2]!),
      length: csi[0].length + 1,
    };
  }
  return /^\[[\d;:<=>?\x20-\x2F]*$/.test(body) ? 'incomplete' : { length: 2 };
}

/** `ESC ] …`: a terminal reply (e.g. the background color answer), ended by BEL or ESC \. Dropped. */
function oscSequence(input: string): Sequence {
  const bell = input.indexOf('\u0007');
  const st = input.indexOf('\u001B\\', 1);
  if (bell === -1 && st === -1) return 'incomplete';
  return {
    length: bell !== -1 && (st === -1 || bell < st) ? bell + 1 : st + 2,
  };
}

/** One escape sequence at the start of `input`: the event (if any), its length, or `incomplete`. */
function escapeSequence(input: string): Sequence {
  if (input.startsWith(PASTE_START)) return pasteSequence(input);
  const second = input[1];
  if (second === undefined) return 'incomplete';
  if (second === '[') return csiSequence(input.slice(1));
  if (second === ']') return oscSequence(input);
  if (second === 'O') {
    if (input.length < 3) return 'incomplete';
    const name = CSI_LETTER[input[2]!];
    return {
      event: name ? key(name) : undefined,
      length: 3,
    };
  }
  if (second === '\u001B') {
    return {
      event: key('escape'),
      length: 1,
    };
  }
  // Alt + key.
  return {
    event: {
      ...plainKey(second),
      meta: true,
    },
    length: 2,
  };
}

function plainKey(char: string): KeyEvent {
  if (char === '\r') return key('return');
  // Ctrl+J: a newline, like Shift+Enter.
  if (char === '\n') return key('return', { shift: true });
  if (char === '\u007F' || char === '\b') return key('backspace');
  if (char === '\t') return key('tab');
  const code = char.charCodeAt(0);
  if (code > 0 && code < 27) {
    return key('char', {
      ctrl: true,
      text: String.fromCharCode(code + 96),
    });
  }
  return key('char', { text: char });
}

/**
 * Parse a chunk of input. Returns the events and any unfinished tail (an escape sequence split
 * across chunks, or a lone ESC that may start one), to prepend to the next chunk.
 */
export function parseInput(input: string): {
  events: InputEvent[];
  rest: string;
} {
  const events: InputEvent[] = [];
  let i = 0;
  while (i < input.length) {
    const char = input[i]!;
    if (char === '\u001B') {
      const result = escapeSequence(input.slice(i));
      if (result === 'incomplete') {
        return {
          events,
          rest: input.slice(i),
        };
      }
      if (result.event) events.push(result.event);
      i += result.length;
      continue;
    }
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127) {
      events.push(plainKey(char));
      i++;
      continue;
    }
    // A run of printable text (fast typing or an unbracketed paste) is one event.
    let end = i;
    while (
      end < input.length &&
      input.charCodeAt(end) >= 32 &&
      input.charCodeAt(end) !== 127 &&
      input[end] !== '\u001B'
    )
      end++;
    events.push(
      key('char', {
        text: input.slice(i, end),
      })
    );
    i = end;
  }
  return { events, rest: '' };
}
