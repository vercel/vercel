import chalk from 'chalk';
import output from '../../output-manager';

export const ALIGNED_LABEL_WIDTH = 12;

/**
 * Prints a label-value row aligned to a shared value column.
 *
 * Layout (column 0 is the leftmost terminal column):
 *   "  Linked      acme/web"     (no gutter:  "  " + 12-char label = value at col 14)
 *   "▲ Production  https://..."  (gutter '▲': "▲ " + 12-char label = value at col 14)
 *
 * The 2-char prefix is the CLI's "gutter" — column 0 is reserved for
 * semantic glyphs (▲ Vercel/Production, ✓ Ready, ? prompt). Everything else
 * lives at column 2+ as indented body content. See the deploy-flow design
 * doc for the full gutter system.
 */
export function printAlignedLabel(
  label: string,
  value: string,
  options: { gutter?: string } = {}
): void {
  const prefix = options.gutter ? `${options.gutter} ` : '  ';
  output.print(
    `${prefix}${chalk.bold(label.padEnd(ALIGNED_LABEL_WIDTH))}${chalk.bold(value)}\n`
  );
}
