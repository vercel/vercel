// Packages
import chalk from 'chalk';

// The equivalent of <code>, for embedding anything
// you may want to take a look at ./cmd.js

export default function code(cmd: string, { backticks = true } = {}): string {
  const tick = backticks ? chalk.gray('`') : '';
  return `${tick}${chalk.bold(cmd)}${tick}`;
}
