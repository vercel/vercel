import stripAnsi from 'strip-ansi';
import { getGlobalFlagsFromArgv } from '../agent-output';
import { getCommandNamePlain } from '../pkg-name';

/** Keep remote metadata and log messages on one terminal-safe output line. */
export function ciDisplayText(value: string): string {
  return Array.from(stripAnsi(value), char => {
    const code = char.codePointAt(0)!;
    if (code >= 127 && code <= 159) {
      return `\\u${code.toString(16).padStart(4, '0')}`;
    }
    return code < 32 ? JSON.stringify(char).slice(1, -1) : char;
  }).join('');
}

export function quoteCiCommandArg(value: string): string {
  if (/^[a-zA-Z0-9_./:@%+,=-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** Preserve safe invocation context without leaking authentication tokens. */
export function buildCiCommand(argv: string[], args: string[]): string {
  // Keep argv tokens intact: splitting a quoted command can mistake task text
  // such as "build --team=fake" for a real global option and drop its context.
  return getCommandNamePlain(
    [...args, ...getGlobalFlagsFromArgv(argv)].map(quoteCiCommandArg).join(' ')
  );
}
