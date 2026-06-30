import chalk from 'chalk';
import output from '../../../output-manager';
import {
  ALIGNED_LABEL_WIDTH,
  printAlignedLabel,
} from '../../output/print-aligned-label';
import { renderDiff } from './diff';
import { maskSecret } from './gateway';
import type { SetupPlan } from './apply';
import type { CodingAgent } from './types';

export function printResolvedState(args: {
  selected: CodingAgent[];
  willCreate: boolean;
  name?: string;
  budget?: number;
  refreshPeriod?: string;
  expiresAt?: number;
  keychain?: boolean;
}): void {
  const { selected, willCreate, name, budget, refreshPeriod, expiresAt } = args;
  output.print(chalk.bold('  Summary\n'));
  printAlignedLabel('Agents', selected.map(a => a.displayName).join(', '));
  if (!willCreate) {
    printAlignedLabel('API key', 'Using provided key');
    output.print('\n');
    return;
  }
  printAlignedLabel(
    'API key',
    name ? `Creating new key "${name}"` : 'Creating new key'
  );
  let spendLimit = 'Unlimited';
  if (budget !== undefined) {
    const period =
      refreshPeriod && refreshPeriod !== 'none' ? refreshPeriod : '';
    spendLimit = period ? `$${budget}/${period}` : `$${budget}`;
  }
  printAlignedLabel('Spend limit', spendLimit);
  printAlignedLabel(
    'Expires',
    expiresAt !== undefined
      ? new Date(expiresAt).toISOString().slice(0, 10)
      : 'Never'
  );
  if (args.keychain !== undefined) {
    printAlignedLabel(
      'Key storage',
      args.keychain ? 'macOS Keychain' : 'Config files'
    );
  }
  output.print('\n');
}

export function printPlan(
  plan: SetupPlan,
  previewKey: string,
  opts: { backup?: boolean } = {}
): void {
  // The backup promise belongs up front — before the user decides — not only
  // in the post-apply receipt.
  output.print(
    opts.backup
      ? `${chalk.bold('  Planned changes')}  ${chalk.dim(
          'existing files are backed up alongside as .bak first'
        )}\n`
      : chalk.bold('  Planned changes\n')
  );
  for (const change of plan.changes) {
    if (change.status === 'unchanged') {
      output.print(
        `  ${chalk.dim(`= ${change.label} (unchanged)`)}  ${chalk.dim(change.path)}\n`
      );
      continue;
    }
    if (change.status === 'error') {
      // A skipped file is a nonfatal warning: yellow gutter, dim detail.
      output.print(
        `${chalk.yellow('!')} ${chalk.bold(change.label)}  ${chalk.dim(change.path)}\n`
      );
      output.print(chalk.dim(`    cannot edit: ${change.error}\n`));
      continue;
    }
    const verb = change.status === 'create' ? 'create' : 'update';
    output.print(
      `  ${verb === 'create' ? chalk.green('+') : '~'} ${chalk.bold(change.label)} (${verb})  ${chalk.dim(change.path)}\n`
    );
    // An existing file is copied to `<path>.bak` before it's overwritten;
    // surface that side effect in the preview unless backups are disabled.
    if (opts.backup && change.current !== null) {
      output.print(chalk.dim(`    ↳ backs up to ${change.path}.bak\n`));
    }
    const diff = renderDiff(change.current ?? '', change.next ?? '', {
      secrets: [previewKey],
      indent: '    ',
    });
    if (diff) {
      output.print(`${diff}\n`);
    }
  }
  output.print('\n');
}

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

/** Masked-key receipt row, e.g. `API Key  vck_1234••••abcd · macOS Keychain`. */
export function printKeyRow(
  key: string,
  opts: { keychain?: boolean } = {}
): void {
  printAlignedLabel(
    'API Key',
    `${maskSecret(key)} · ${opts.keychain ? 'macOS Keychain' : 'Config files'}`
  );
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

export function printKey(key: string, opts: { keychain?: boolean } = {}): void {
  output.print('\n');
  printKeyRow(key, opts);
}
