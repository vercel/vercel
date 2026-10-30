import chalk from 'chalk';

type HelpStream = { isTTY?: boolean };

export interface HelpTheme {
  description: (text: string) => string;
  heading: (text: string) => string;
  emphasis: (text: string) => string;
  reference: (text: string) => string;
  command: (text: string) => string;
  link: (text: string) => string;
}

// Capture capabilities, not the mutable global Chalk level used by stderr.
const stdoutLevel = chalk.supportsColor ? chalk.supportsColor.level : 0;
const stderrLevel = chalk.stderr.supportsColor
  ? chalk.stderr.supportsColor.level
  : 0;
let noColorFlag = false;

/** Called once with the parsed global preference, before help dispatch. */
export function configureHelpOutput(noColor: boolean | undefined): void {
  noColorFlag = !!noColor;
}

/** Help is static and per-stream; forcing color never makes a pipe rich. */
export function createHelpTheme(
  stream: HelpStream = process.stdout,
  options: { noColor?: boolean; level?: chalk.Level } = {}
): HelpTheme {
  const disabled =
    (options.noColor ?? noColorFlag) ||
    !!process.env.NO_COLOR ||
    process.env.FORCE_COLOR === '0' ||
    process.env.TERM === 'dumb' ||
    !stream.isTTY;
  const detected = stream === process.stderr ? stderrLevel : stdoutLevel;
  const level = disabled
    ? 0
    : (options.level ??
      (/^[123]$/.test(process.env.FORCE_COLOR ?? '') ? 1 : detected));
  const style = new chalk.Instance({ level });
  return {
    description: text => style.dim(text),
    heading: text => style.bold.magenta(text),
    emphasis: text => style.bold(text),
    reference: text => style.bold(text),
    command: text => style.cyan(text),
    link: text => style.underline(text),
  };
}
