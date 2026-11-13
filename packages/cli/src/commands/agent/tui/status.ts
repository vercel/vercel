import type { Line } from './ui/text';
import { color, glyph, SPINNER_FRAMES } from './theme';
import { lineWidth, truncate } from './ui/text';

export function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** `⠋ Checking the build logs…  12s · esc to interrupt`. Redrawn on the chat's tick. */
export function spinnerLine(
  label: string | undefined,
  startedAt: number,
  width: number,
  now = Date.now()
): Line {
  const frame = SPINNER_FRAMES[Math.floor(now / 80) % SPINNER_FRAMES.length]!;
  const text = (label?.trim() || 'Thinking').replace(/[.…]+$/, '');
  return truncate(
    [
      {
        text: frame,
        style: { color: color.accent },
      },
      { text: ` ${text}…` },
      {
        text: `  ${formatElapsed(now - startedAt)} · esc to interrupt`,
        style: { color: color.subtle },
      },
    ],
    width
  );
}

export interface FooterOptions {
  hint: string;
  scope: string;
  sessionId: string;
  /** Lines below the visible transcript, when scrolled up. */
  below?: number;
}

/** The docked bottom line: hints on the left, where you are on the right. */
export function footerLine(
  { hint, scope, sessionId, below = 0 }: FooterOptions,
  width: number
): Line {
  const left: Line = [
    ...(below > 0
      ? [
          {
            text: `${glyph.expanded} ${below} more lines below · pgdn  `,
            style: { color: color.accent },
          },
        ]
      : []),
    {
      text: hint,
      style: { color: color.subtle },
    },
  ];
  const right: Line = [
    {
      text: `${scope} · ${sessionId.slice(0, 8)}`,
      style: { color: color.subtle },
    },
  ];
  const gap = width - lineWidth(left) - lineWidth(right);
  return gap >= 2
    ? [
        ...left,
        {
          text: ' '.repeat(gap),
        },
        ...right,
      ]
    : truncate(left, width);
}
