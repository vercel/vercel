import { Readable } from 'stream';

export async function* createAnsiIterator(stream: Readable) {
  let done = false;
  let leftover: string | undefined = '';
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

async function parseNext(it: AsyncIterator<string>, leftover = '') {
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
    return { type: 'text', raw: chunk };
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

async function parseEscapeSequence(it: AsyncIterator<string>, leftover = '') {
  let chunk = leftover;
  while (chunk.length === 0) {
    const next = await it.next();
    if (next.done) return;
    chunk = `${leftover}${next.value}`;
  }
  if (/[\u0040-\u005F]/.test(chunk[0])) {
    // Fe Escape sequences (color codes, movements, hyperlinks, etc.)
    // https://en.wikipedia.org/wiki/C0_and_C1_control_codes#C1_controls
    return parseFeEscapeSequence(it, chunk);
  }
  console.log(`Unsupported escape code sequence: ${JSON.stringify(chunk)}`);
}

async function parseFeEscapeSequence(it: AsyncIterator<string>, leftover = '') {
  let chunk = leftover;

  // Read at least until the next byte
  while (chunk.length === 0) {
    const next = await it.next();
    if (next.done) return;
    chunk = `${leftover}${next.value}`;
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
  leftover = ''
) {
  let chunk = leftover;

  // Read until chunk contains terminator (byte in the range 0x40 through 0x7E)
  let terminatorMatch: RegExpMatchArray | null = null;
  while ((terminatorMatch = chunk.match(/[\u0040-\u007E]/)) === null) {
    const next = await it.next();
    if (next.done) return;
    chunk = `${leftover}${next.value}`;
  }

  const { index } = terminatorMatch;
  if (typeof index !== 'number') return;

  const code = terminatorMatch[0];
  const parameters = chunk.substring(0, index);
  leftover = chunk.substring(index + code.length);
  const raw = `\u001b[${parameters}${code}`;

  if (code === 'm') {
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

  console.log(`Unsupported CSI escape code sequence: ${JSON.stringify(raw)}`);
  return {
    type: 'escape',
    code,
    parameters,
    leftover,
  };
}
