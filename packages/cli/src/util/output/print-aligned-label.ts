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
export function formatAlignedLabel(
  label: string,
  value: string,
  options: { gutter?: string } = {}
): string {
  const gutter = options.gutter === '✓' ? chalk.green('✓') : options.gutter;
  const prefix = gutter ? `${gutter} ` : '  ';
  // Labels at or beyond the column width would run into the value, so keep at
  // least one separating space instead of aligning them.
  const paddedLabel =
    label.length < ALIGNED_LABEL_WIDTH
      ? label.padEnd(ALIGNED_LABEL_WIDTH)
      : `${label} `;
  return `${prefix}${chalk.bold(paddedLabel)}${value}`;
}

export function printAlignedLabel(
  label: string,
  value: string,
  options: { gutter?: string } = {}
): void {
  output.print(`${formatAlignedLabel(label, chalk.bold(value), options)}\n`);
}
