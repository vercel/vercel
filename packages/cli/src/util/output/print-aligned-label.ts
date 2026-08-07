import chalk from 'chalk';
import output from '../../output-manager';

export const ALIGNED_LABEL_WIDTH = 16;

/**
 * Prints a label-value row aligned to a shared value column.
 *
 * Layout (column 0 is the leftmost terminal column):
 *   "  Linked          acme/web"   (no gutter:  "  " + 16-char label = value at col 18)
 *   "▲ Aliased         https://..." (gutter '▲': "▲ " + 16-char label = value at col 18)
 *   "✓ Added           API_TOKEN"   (gutter '✓': "✓ " + 16-char label = value at col 18)
 *
 * The 2-char prefix is the CLI's "gutter" — column 0 is reserved for
 * semantic glyphs (▲ production URL, ✓ primary completed phase, ? prompt).
 * The ▲ renders at
 * most once per deploy summary: on the Aliased row, or on the Production
 * row when no Aliased row will print. Everything else lives at column 2+
 * as indented body content. See the cli-ux skill's Layout and Glyphs + Color
 * sections for the full gutter system.
 */
export function printAlignedLabel(
  label: string,
  value: string,
  options: { gutter?: string } = {}
): void {
  const gutter = options.gutter === '✓' ? chalk.green('✓') : options.gutter;
  const prefix = gutter ? `${gutter} ` : '  ';
  output.print(
    `${prefix}${chalk.bold(label.padEnd(ALIGNED_LABEL_WIDTH))}${chalk.bold(value)}\n`
  );
}
