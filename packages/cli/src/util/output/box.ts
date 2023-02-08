import chalk from 'chalk';
import stripAnsi from 'strip-ansi';

const border = ['─', '╭', '╮', '│', '│', '╰', '╯'];
const nothing = ['─', '', '', '', '', '', ''];

export type BoxOptions = {
  borderColor?:
    | 'black'
    | 'red'
    | 'green'
    | 'yellow'
    | 'blue'
    | 'magenta'
    | 'cyan'
    | 'white';
  padding?: number;
  textAlignment?: 'left' | 'center' | 'right';
  terminalColumns?: number;
};

/**
 * Renders text centered inside a yellow box. If terminal is too narrow to fit
 * the text without wrapping, the box will only consist of a top and bottom
 * horizontal rule with the text left justified.
 *
 * @param message The multiline message to display
 * @param options Various formatting options
 * @returns The rendered string
 *
 * @example Simple box
 *
 * # Usage
 * ```
 * console.log(box('Hello world!\nThe quick brown fox jumps over the lazy dog'));
 * ```
 *
 * # Result
 * ```
 * ╭─────────────────────────────────────────────────╮
 * │                                                 │
 * │                  Hello world!                   │
 * │   The quick brown fox jumps over the lazy dog   │
 * │                                                 │
 * ╰─────────────────────────────────────────────────╯
 * ```
 */
export default function box(
  message: string,
  {
    borderColor,
    padding = 1,
    textAlignment = 'center',
    terminalColumns: cols = process.stdout.columns ||
      (process.env.COLUMNS && parseInt(process.env.COLUMNS, 10)) ||
      80,
  }: BoxOptions = {}
): string {
  const lines: [string, number][] = message
    .split(/\r?\n/)
    .map(line => [line, stripAnsi(line).length]);
  const maxLine = lines.reduce((p, [, len]) => Math.max(p, len), 0);
  const borderColorFn = (borderColor && chalk[borderColor]) || chalk.yellow;
  const clampedSidePadding = Math.max(1, padding * 3);
  const narrowMode = maxLine + 2 + clampedSidePadding * 2 > cols;
  const sidePadding = narrowMode ? 0 : clampedSidePadding;
  const innerWidth = Math.min(maxLine + sidePadding * 2, cols);
  const [hr, topLeft, topRight, left, right, bottomLeft, bottomRight] =
    narrowMode ? nothing : border;
  const spacerRow = narrowMode
    ? '\n'.repeat(padding)
    : `${borderColorFn(`${left}${' '.repeat(innerWidth)}${right}`)}\n`.repeat(
        padding
      );

  const renderLine = ([line, len]: [string, number]) => {
    let leftPadding = 0;
    let rightPadding = 0;

    if (!narrowMode) {
      leftPadding = sidePadding;
      rightPadding = sidePadding;

      if (textAlignment === 'center') {
        leftPadding += Math.floor((maxLine - len) / 2);
        rightPadding += maxLine - len - leftPadding + sidePadding;
      } else if (textAlignment === 'right') {
        leftPadding += maxLine - len;
      } else if (textAlignment === 'left') {
        rightPadding += maxLine - len;
      }
    }

    return (
      borderColorFn(left) +
      ' '.repeat(leftPadding) +
      line +
      ' '.repeat(rightPadding) +
      borderColorFn(right)
    );
  };

  return (
    borderColorFn(`${topLeft}${hr.repeat(innerWidth)}${topRight}`) +
    '\n' +
    spacerRow +
    lines.map(renderLine).join('\n') +
    '\n' +
    spacerRow +
    borderColorFn(`${bottomLeft}${hr.repeat(innerWidth)}${bottomRight}`)
  );
}
