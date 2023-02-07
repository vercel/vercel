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
 * Renders text centered inside a yellow box. It applies 1 line of padding on
 * the top/bottom and 4 characters of padding on the left/right.
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
  const slim = maxLine + clampedSidePadding * 2 > cols;
  const sidePadding = slim ? 0 : clampedSidePadding;
  const innerWidth = maxLine + sidePadding * 2;
  const [hr, topLeft, topRight, left, right, bottomLeft, bottomRight] = slim
    ? nothing
    : border;
  const spacerRow = slim
    ? '\n'.repeat(padding)
    : `${borderColorFn(`${left}${' '.repeat(innerWidth)}${right}`)}\n`.repeat(
        padding
      );

  return (
    borderColorFn(`${topLeft}${hr.repeat(innerWidth)}${topRight}`) +
    '\n' +
    spacerRow +
    lines
      .map(([line, len]) => {
        let leftPadding = 0;
        let rightPadding = 0;

        if (!slim) {
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

        return `${borderColorFn(left)}${' '.repeat(
          leftPadding
        )}${line}${' '.repeat(rightPadding)}${borderColorFn(right)}`;
      })
      .join('\n') +
    '\n' +
    spacerRow +
    borderColorFn(`${bottomLeft}${hr.repeat(innerWidth)}${bottomRight}`)
  );
}
