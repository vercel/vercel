import chalk from 'chalk';
import output from '../../../output-manager';
import {
  ALIGNED_LABEL_WIDTH,
  printAlignedLabel,
} from '../../output/print-aligned-label';
import { maskSecret } from './gateway';
import type { SetupPlan } from './apply';

/** Warning gutter row (`! <message>`), not output.warn's WARNING! label. */
export function printWarning(message: string): void {
  output.print(`${chalk.yellow('!')} ${message}\n`);
}

/** Status/outcome sentence behind the blank two-space gutter. */
export function printStatus(message: string): void {
  output.print(`  ${message}\n`);
}

/** Secondary receipt row: blank gutter, bold label, dim path value. */
export function printReceiptPath(label: string, path: string): void {
  output.print(
    `  ${chalk.bold(label.padEnd(ALIGNED_LABEL_WIDTH))}${chalk.dim(path)}\n`
  );
}

/** Masked-key receipt row, e.g. `API Key  vck_1234••••abcd`. */
export function printKeyRow(key: string): void {
  printAlignedLabel('API Key', maskSecret(key));
}

export function printNotes(plan: SetupPlan): void {
  if (plan.notes.length === 0) {
    return;
  }
  output.print('\n');
  for (const note of plan.notes) {
    for (const line of note.notes) {
      output.log(`${note.displayName}: ${line}`);
    }
  }
}

export function printKey(key: string): void {
  output.print('\n');
  printKeyRow(key);
}
