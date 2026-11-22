import stripAnsi from 'strip-ansi';

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/g;
const FORMAT_CHARACTERS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

/**
 * Remote text (an API's or service's message, a remote name) made safe to show
 * on one line: no escape sequences, control characters, or bidirectional and
 * zero-width format characters, and newlines shown as `\n`. It's data, never
 * instructions, so it goes in an attributed detail row, not a headline.
 */
export function remoteText(value: string): string {
  return stripAnsi(value)
    .replace(/\r?\n/g, '\\n')
    .replace(CONTROL_CHARACTERS, '')
    .replace(FORMAT_CHARACTERS, '');
}
