import type { Buffer } from 'node:buffer';
import type { Background } from './theme';

/** Parse an OSC 11 reply like `ESC]11;rgb:1e1e/1e1e/1e1e BEL` into dark or light. */
export function parseBackgroundReply(reply: string): Background | undefined {
  const match = /\]11;rgb:([\da-f]+)\/([\da-f]+)\/([\da-f]+)/i.exec(reply);
  if (!match) return undefined;
  // Channels have 1-4 hex digits; scale each to 0..1.
  const [r, g, b] = match
    .slice(1)
    .map(hex => Number.parseInt(hex, 16) / (16 ** hex.length - 1)) as [
    number,
    number,
    number,
  ];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? 'light' : 'dark';
}

/** `COLORFGBG` (`fg;bg`, set by some terminals): ANSI 7 and 9-15 are light backgrounds. */
export function backgroundFromEnv(
  env: Record<string, string | undefined>
): Background | undefined {
  const bg = Number(env.COLORFGBG?.split(';').at(-1));
  if (!env.COLORFGBG || Number.isNaN(bg)) return undefined;
  return bg === 7 || bg >= 9 ? 'light' : 'dark';
}

interface QueryInput {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => unknown;
  on: (event: 'data', listener: (chunk: Buffer | string) => void) => unknown;
  off: (event: 'data', listener: (chunk: Buffer | string) => void) => unknown;
  resume: () => unknown;
  pause: () => unknown;
}

/** Ask the terminal for its background color (OSC 11). Resolves `undefined` if it does not answer in time. */
export async function queryBackground(
  input: QueryInput,
  output: { write: (text: string) => unknown },
  timeoutMs = 150
): Promise<Background | undefined> {
  if (!input.isTTY || !input.setRawMode) return undefined;
  input.setRawMode(true);
  input.resume();
  let reply = '';
  let onData!: (chunk: Buffer | string) => void;
  const answer = await new Promise<Background | undefined>(resolve => {
    const timer = setTimeout(resolve, timeoutMs, undefined);
    onData = chunk => {
      reply += String(chunk);
      const background = parseBackgroundReply(reply);
      if (background) {
        clearTimeout(timer);
        resolve(background);
      }
    };
    input.on('data', onData);
    // BEL-terminated, so the reply is BEL-terminated too.
    output.write('\u001B]11;?\u0007');
  });
  input.off('data', onData);
  input.setRawMode(false);
  input.pause();
  return answer;
}
