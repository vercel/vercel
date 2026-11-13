/**
 * Geist roles mapped onto the terminal's ANSI palette, so the user's theme still applies.
 * https://vercel.com/geist/colors: blue for focus and selection, green/red/amber for status.
 *
 * Grays carry the information levels: `muted` for secondary text (Geist gray-900), `subtle`
 * for tertiary text (gray-700) and `border` for rules and borders (gray-500). A 16-color terminal
 * has a single gray, so all three start as ANSI gray; `applyGrayScale` swaps in real gray steps
 * where the terminal can show them.
 */
export const color = {
  accent: 'blue',
  success: 'green',
  error: 'red',
  warning: 'yellow',
  muted: 'gray',
  subtle: 'gray',
  border: 'gray',
};

/** Geist gray steps per terminal background. */
const GRAYS = {
  dark: { muted: '#a1a1a1', subtle: '#8f8f8f', border: '#454545' },
  light: { muted: '#4d4d4d', subtle: '#8f8f8f', border: '#c9c9c9' },
} as const;

export type Background = keyof typeof GRAYS;

/** 256-color or truecolor terminals can show several grays (Ink downsamples hex to 256 colors). */
export function supportsGrayScale(
  env: Record<string, string | undefined>
): boolean {
  if (env.NO_COLOR || env.TERM === 'dumb') return false;
  return (
    /^(?:truecolor|24bit)$/i.test(env.COLORTERM ?? '') ||
    /256|direct|kitty|ghostty/.test(env.TERM ?? '')
  );
}

/** Use Geist's gray steps instead of the single ANSI gray. */
export function applyGrayScale(background: Background): void {
  Object.assign(color, GRAYS[background]);
}

/** Neutral marks. The ▲ brand mark appears only in headers; ▸/▾ mark collapsible lines. */
export const glyph = {
  /** The brand mark, in headers only. */
  logo: '▲',
  /** The agent's answers. */
  answer: '●',
  /** A tool call; colored by status. */
  tool: '●',
  /** A tool call still running (alternates with `tool`). */
  running: '○',
  collapsed: '▸',
  expanded: '▾',
  /** The user's messages and the prompt. */
  prompt: '›',
  selected: '›',
  pending: '○',
  success: '✓',
  connector: '└',
} as const;

/** The `dots` spinner Vercel CLI uses. */
export const SPINNER_FRAMES = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
