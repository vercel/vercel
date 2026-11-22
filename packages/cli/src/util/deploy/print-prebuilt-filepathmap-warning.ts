import chalk from 'chalk';
import output from '../../output-manager';

/**
 * Prints a `--prebuilt` `filePathMap` / `.vercelignore` collision warning
 * immediately to stderr so it is visible even if the deploy later fails.
 *
 * Records telemetry that this deploy would fail closed in an upcoming
 * release. Paths are never included.
 */
export function printPrebuiltFilePathMapIgnoreWarning(
  message: string,
  telemetry: { trackPrebuiltFilePathMapWouldFailClosed(): void }
) {
  telemetry.trackPrebuiltFilePathMapWouldFailClosed();
  const [first = '', ...rest] = message.split('\n');
  output.print(`${chalk.yellow('!')} ${first}\n`);
  for (const line of rest) {
    output.print(`${line && !/^\s/.test(line) ? `  ${line}` : line}\n`);
  }
}
