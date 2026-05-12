import chalk from 'chalk';
import output from '../../output-manager';

export const ALIGNED_LABEL_WIDTH = 12;

export function printAlignedLabel(label: string, value: string): void {
  output.print(
    `${chalk.bold(label.padEnd(ALIGNED_LABEL_WIDTH))}${chalk.bold(value)}\n`
  );
}
