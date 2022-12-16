export interface TokenBase {
  raw: string;
  leftover: string;
}

export interface ControlCode extends TokenBase {
  type: 'control';
}

export interface TextSequence extends TokenBase {
  type: 'text';
}

export interface EscapeSequenceBase extends TokenBase {
  type: 'escape';
  code: string;
  parameters: string;
}

export interface StepsEscapeSequence extends EscapeSequenceBase {
  abbr: 'CUU' | 'CUD' | 'CUF' | 'CUB' | 'CNL' | 'CPL' | 'CHA' | 'SU' | 'ST';
  steps: number;
}

export interface ModeEscapeSequence extends EscapeSequenceBase {
  abbr: 'ED' | 'EL';
  mode: number;
}

export interface RowsColsEscapeSequence extends EscapeSequenceBase {
  abbr: 'CHA' | 'CUP' | 'HVP';
  row: number;
  column: number;
}

export interface SgrEscapeSequence extends EscapeSequenceBase {
  abbr: 'SGR';
  style: SgrStyle;
}

export interface NoParamsEscapeSequence extends EscapeSequenceBase {
  abbr: 'SCP' | 'RCP' | 'unknown';
}

export type EscapeSequence =
  | NoParamsEscapeSequence
  | StepsEscapeSequence
  | ModeEscapeSequence
  | RowsColsEscapeSequence
  | SgrEscapeSequence;

export type AnsiToken = ControlCode | EscapeSequence | TextSequence;

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface SgrStyle {
  reset?: boolean;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  slowBlink?: boolean;
  fastBlink?: boolean;
  invert?: boolean;
  foregroundColor?: RgbColor | number | false;
  backgroundColor?: RgbColor | number | false;
}

export async function* createAnsiIterator(stream: AsyncIterable<string>) {
  let done = false;
  let leftover = '';
  const it = stream[Symbol.asyncIterator]();
  while (!done) {
    const next = await parseNext(it, leftover);
    if (next) {
      leftover = next.leftover;
      yield next;
    } else {
      done = true;
    }
  }
}

async function parseNext(
  it: AsyncIterator<string>,
  leftover: string
): Promise<AnsiToken | undefined> {
  let chunk = leftover;
  if (chunk.length === 0) {
    const next = await it.next();
    if (next.done) return;
    chunk = next.value;
  }

  // Parse out the c0 control sequences first
  const match = chunk.match(/[\u0000-\u001f]/);

  if (!match) {
    // No control code in this chunk - emit as text
    return { type: 'text', raw: chunk, leftover: '' };
  }

  if (typeof match.index === 'number' && match.index > 0) {
    // Some text before control code - emit as text
    return {
      type: 'text',
      raw: chunk.substring(0, match.index),
      leftover: chunk.substring(match.index),
    };
  }

  // control code at index 0
  const control = chunk[0];
  if (control === '\u001b' /* ESC */) {
    return parseEscapeSequence(it, chunk.substring(1));
  } else {
    // Single byte control code, such as `\r`, `\n`, etc.
    return {
      type: 'control',
      raw: control,
      leftover: chunk.substring(1),
    };
  }
}

async function parseEscapeSequence(
  it: AsyncIterator<string>,
  leftover: string
): Promise<AnsiToken | undefined> {
  let chunk = leftover;
  while (chunk.length === 0) {
    const next = await it.next();
    if (next.done) return;
    chunk = `${chunk}${next.value}`;
  }
  if (/[\u0040-\u005F]/.test(chunk[0])) {
    // Fe Escape sequences (color codes, movements, hyperlinks, etc.)
    // https://en.wikipedia.org/wiki/C0_and_C1_control_codes#C1_controls
    return parseFeEscapeSequence(it, chunk);
  }
  console.log(`Unsupported escape code sequence: ${JSON.stringify(chunk)}`);
}

async function parseFeEscapeSequence(
  it: AsyncIterator<string>,
  leftover: string
): Promise<AnsiToken | undefined> {
  let chunk = leftover;

  // Read at least until the next byte
  while (chunk.length === 0) {
    const next = await it.next();
    if (next.done) return;
    chunk = `${chunk}${next.value}`;
  }

  const c1 = chunk[0];
  leftover = chunk.substring(1);

  if (c1 === '[' /* CSI */) {
    // Starts most of the useful sequences, terminated by a byte in the range 0x40 through 0x7E.
    return parseCsiEscapeSequence(it, leftover);
  } else if (c1 === ']' /* OSC */) {
    // Starts a control string for the operating system to use, terminated by ST.
    return parseOscEscapeSequence(it, leftover);
  }
  console.log(`Unsupported Fe escape code sequence: ${JSON.stringify(chunk)}`);
}

async function parseCsiEscapeSequence(
  it: AsyncIterator<string>,
  leftover: string
): Promise<AnsiToken | undefined> {
  let chunk = leftover;

  // Read until chunk contains terminator (byte in the range 0x40 through 0x7E)
  let terminatorMatch: RegExpMatchArray | null = null;
  while ((terminatorMatch = chunk.match(/[\u0040-\u007E]/)) === null) {
    const next = await it.next();
    if (next.done) return;
    chunk = `${chunk}${next.value}`;
  }

  const { index } = terminatorMatch;
  if (typeof index !== 'number') return;

  const code = terminatorMatch[0];
  const parameters = chunk.substring(0, index);
  leftover = chunk.substring(index + code.length);
  const raw = `\u001b[${parameters}${code}`;

  if (code === 'm') {
    // CSI n m
    // Sets colors and style of the characters following this escape code.
    return {
      type: 'escape',
      abbr: 'SGR', // Select Graphic Rendition
      code,
      parameters,
      raw,
      style: parseSgrStyle(parameters),
      leftover,
    };
  }

  if (code === 'A') {
    // CSI n A
    // Moves the cursor up n (default 1) cells.
    // If the cursor is already at the edge of the screen, this has no effect.
    const steps = parseInt(parameters[0], 10) || 1;
    return {
      type: 'escape',
      abbr: 'CUU', // Cursor Up
      code,
      parameters,
      raw,
      steps,
      leftover,
    };
  }

  if (code === 'B') {
    // CSI n B
    // Moves the cursor down n (default 1) cells.
    // If the cursor is already at the edge of the screen, this has no effect.
    const steps = parseInt(parameters[0], 10) || 1;
    return {
      type: 'escape',
      abbr: 'CUD', // Cursor Down
      code,
      parameters,
      raw,
      steps,
      leftover,
    };
  }

  if (code === 'C') {
    // CSI n C
    // Moves the cursor forward n (default 1) cells.
    // If the cursor is already at the edge of the screen, this has no effect.
    const steps = parseInt(parameters[0], 10) || 1;
    return {
      type: 'escape',
      abbr: 'CUF', // Cursor Forward
      code,
      parameters,
      raw,
      steps,
      leftover,
    };
  }

  if (code === 'D') {
    // CSI n D
    // Moves the cursor back n (default 1) cells.
    // If the cursor is already at the edge of the screen, this has no effect.
    const steps = parseInt(parameters[0], 10) || 1;
    return {
      type: 'escape',
      abbr: 'CUB', // Cursor Back
      code,
      parameters,
      raw,
      steps,
      leftover,
    };
  }

  if (code === 'E') {
    // CSI n E
    // Moves cursor to beginning of the line n (default 1) lines down.
    const steps = parseInt(parameters[0], 10) || 1;
    return {
      type: 'escape',
      abbr: 'CNL', // Cursor Next Line
      code,
      parameters,
      raw,
      steps,
      leftover,
    };
  }

  if (code === 'F') {
    // CSI n F
    // Moves cursor to beginning of the line n (default 1) lines up.
    const steps = parseInt(parameters[0], 10) || 1;
    return {
      type: 'escape',
      abbr: 'CPL', // Cursor Previous Line
      code,
      parameters,
      raw,
      steps,
      leftover,
    };
  }

  if (code === 'G') {
    // CSI n G
    // Moves the cursor to column n (default 1).
    const steps = parseInt(parameters[0], 10) || 1;
    return {
      type: 'escape',
      abbr: 'CHA', // Cursor Horizontal Absolute
      code,
      parameters,
      raw,
      steps,
      leftover,
    };
  }

  if (code === 'H') {
    // CSI n ; m H
    // Moves the cursor to row n, column m.
    // The values are 1-based, and default to 1 (top left corner) if omitted.
    // A sequence such as CSI ;5H is a synonym for CSI 1;5H,
    // as well as CSI 17;H is the same as CSI 17H and CSI 17;1H
    const parts = parameters.split(';');
    const row = parseInt(parts[0], 10) || 1;
    const column = parseInt(parts[1], 10) || 1;
    return {
      type: 'escape',
      abbr: 'CUP', // Cursor Position
      code,
      parameters,
      raw,
      row,
      column,
      leftover,
    };
  }

  if (code === 'J') {
    // CSI n J
    // Clears part of the screen.
    // If n is 0 (or missing), clear from cursor to end of screen.
    // If n is 1, clear from cursor to beginning of the screen.
    // If n is 2, clear entire screen (and moves cursor to upper left on DOS ANSI.SYS).
    // If n is 3, clear entire screen and delete all lines saved in the scrollback buffer (this feature was added for xterm and is supported by other terminal applications).
    const mode = parseInt(parameters[0], 10) || 0;
    return {
      type: 'escape',
      abbr: 'ED', // Erase In Display
      code,
      parameters,
      raw,
      mode,
      leftover,
    };
  }

  if (code === 'K') {
    // CSI n K
    // Erases part of the line. Cursor position does not change.
    // If n is 0 (or missing), clear from cursor to the end of the line.
    // If n is 1, clear from cursor to beginning of the line.
    // If n is 2, clear entire line.
    const mode = parseInt(parameters[0], 10) || 0;
    return {
      type: 'escape',
      abbr: 'EL', // Erase In Line
      code,
      parameters,
      raw,
      mode,
      leftover,
    };
  }

  if (code === 'S') {
    // CSI n S
    // Scroll whole page up by n (default 1) lines. New lines are added at the bottom.
    const steps = parseInt(parameters[0], 10) || 1;
    return {
      type: 'escape',
      abbr: 'SU', // Scroll Up
      code,
      parameters,
      raw,
      steps,
      leftover,
    };
  }

  if (code === 'T') {
    // CSI n T
    // Scroll whole page down by n (default 1) lines. New lines are added at the top.
    const steps = parseInt(parameters[0], 10) || 1;
    return {
      type: 'escape',
      abbr: 'ST', // Scroll Down
      code,
      parameters,
      raw,
      steps,
      leftover,
    };
  }

  if (code === 'f') {
    // CSI n ; m f
    // Same as CUP, but counts as a format effector function (like CR or LF)
    // rather than an editor function (like CUD or CNL).
    // This can lead to different handling in certain terminal modes.
    const parts = parameters.split(';');
    const row = parseInt(parts[0], 10) || 1;
    const column = parseInt(parts[1], 10) || 1;
    return {
      type: 'escape',
      abbr: 'HVP', // Horizontal Vertical Position
      code,
      parameters,
      raw,
      row,
      column,
      leftover,
    };
  }

  if (code === 's') {
    // CSI s
    // Saves the cursor position/state in SCO console mode.
    return {
      type: 'escape',
      abbr: 'SCP', // Save Current Cursor Position
      code,
      parameters,
      raw,
      leftover,
    };
  }

  if (code === 'u') {
    // CSI s
    // Restores the cursor position/state in SCO console mode.
    return {
      type: 'escape',
      abbr: 'RCP', // Restore Saved Cursor Position
      code,
      parameters,
      raw,
      leftover,
    };
  }

  console.log(`Unsupported CSI escape code sequence: ${JSON.stringify(raw)}`);
  return {
    type: 'escape',
    abbr: 'unknown',
    code,
    parameters,
    raw,
    leftover,
  };
}

export function parseSgrStyle(input: string): SgrStyle {
  const style: SgrStyle = {};
  const parts = input.split(/[;:]/).map(Number);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === 0) {
      // reset
      style.bold = false;
      style.dim = false;
      style.italic = false;
      style.underline = false;
      style.foregroundColor = false;
      style.backgroundColor = false;
    } else if (part === 1) {
      style.bold = true;
    } else if (part === 2) {
      style.dim = true;
    } else if (part === 3) {
      style.italic = true;
    } else if (part === 4) {
      style.underline = true;
    } else if (part >= 30 && part <= 37) {
      style.foregroundColor = part - 30;
    } else if (part === 38) {
      const mode = parts[++i];
      if (mode === 5) {
        // 256 color
        style.foregroundColor = parts[++i];
      } else if (mode === 2) {
        // 24-bit color
        const r = parts[++i];
        const g = parts[++i];
        const b = parts[++i];
        style.foregroundColor = { r, g, b };
      }
    } else if (part === 39) {
      style.foregroundColor = false;
    } else if (part >= 40 && part <= 47) {
      style.backgroundColor = part - 40;
    } else if (part === 48) {
      const mode = parts[++i];
      if (mode === 5) {
        // 256 color
        style.backgroundColor = parts[++i];
      } else if (mode === 2) {
        // 24-bit color
        const r = parts[++i];
        const g = parts[++i];
        const b = parts[++i];
        style.backgroundColor = { r, g, b };
      }
    } else if (part === 49) {
      style.backgroundColor = false;
    } else {
      console.log(`Unsupported SGR parameter: ${JSON.stringify(parts[i])}`);
    }
  }
  return style;
}

async function parseOscEscapeSequence(
  it: AsyncIterator<string>,
  leftover: string
) {
  let chunk = leftover;

  // Read until chunk contains string terminator ST
  let terminatorMatch: RegExpMatchArray | null = null;
  while ((terminatorMatch = chunk.match(/(\u001b\\|\u0007)/)) === null) {
    const next = await it.next();
    if (next.done) return;
    chunk = `${chunk}${next.value}`;
  }

  const { index } = terminatorMatch;
  if (typeof index !== 'number') return;

  const data = chunk.substring(0, index);
  leftover = chunk.substring(index + terminatorMatch[0].length);
  console.log({ data, index, terminatorMatch });

  return {
    type: 'escape',
    abbr: 'OSC',
    raw: '',
    leftover,
  };
}
