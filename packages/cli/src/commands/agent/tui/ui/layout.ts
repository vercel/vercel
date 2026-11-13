import type { Line, Style } from './text';
import { lineWidth, pad, truncate } from './text';

/**
 * A prefix with content hanging beside it: `render` gets the width left after the prefix, and
 * continuation lines are indented to line up under the first.
 */
export function hang(
  prefix: Line,
  width: number,
  render: (width: number) => Line[]
): Line[] {
  const indent = lineWidth(prefix);
  return render(Math.max(1, width - indent)).map((line, i) => [
    ...(i === 0
      ? prefix
      : [
          {
            text: ' '.repeat(indent),
          },
        ]),
    ...line,
  ]);
}

/** Indent every line by `cells` spaces. */
export function indent(lines: Line[], cells: number): Line[] {
  return lines.map(line => [
    {
      text: ' '.repeat(cells),
    },
    ...line,
  ]);
}

/** A rounded box with one cell of padding; `render` gets the inner width. */
export function box(
  width: number,
  style: Style,
  render: (width: number) => Line[]
): Line[] {
  const inner = Math.max(1, width - 4);
  const border = (text: string): Line[number] => ({ text, style });
  return [
    [border(`╭${'─'.repeat(width - 2)}╮`)],
    ...render(inner).map(line => [
      border('│ '),
      ...pad(truncate(line, inner), inner),
      border(' │'),
    ]),
    [border(`╰${'─'.repeat(width - 2)}╯`)],
  ];
}
