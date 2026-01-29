// Colors support for terminal output
const noColor =
  globalThis.process?.env?.NO_COLOR === '1' ||
  globalThis.process?.env?.TERM === 'dumb';

// map each code to its matching reset code
const resets: Record<number, number> = {
  1: 22,
  31: 39,
  32: 39,
  33: 39,
  34: 39,
  35: 39,
  36: 39,
  90: 39,
};

const _c = (c: number) => (text: string) => {
  if (noColor) return text;
  const off = resets[c] ?? 0;
  return `\u001B[${c}m${text}\u001B[${off}m`;
};

export const Colors = {
  bold: _c(1),
  red: _c(31),
  green: _c(32),
  yellow: _c(33),
  blue: _c(34),
  magenta: _c(35),
  cyan: _c(36),
  gray: _c(90),
  url: (title: string, url: string) =>
    noColor
      ? `[${title}](${url})`
      : `\u001B]8;;${url}\u001B\\${title}\u001B]8;;\u001B\\`,
} as Record<
  | 'bold'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'gray'
  | 'url',
  (text: string) => string
> & {
  url: (title: string, url: string) => string;
};
