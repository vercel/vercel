import chalk from 'chalk';
import output from '../../../output-manager';
import { printAlignedLabel } from '../../output/print-aligned-label';
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
  /** true = stored in Keychain, false = written to configs, undefined = N/A. */
  keychain?: boolean;
}): void {
  const { selected, willCreate, name, budget, refreshPeriod, expiresAt } = args;
  output.print(chalk.bold('Summary\n'));
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
  // Always surface the quota and expiry so the absence of a limit is explicit.
  // Group the quota as <amount>/<period>, e.g. $500/monthly (or just $500 for a
  // one-time limit), falling back to "Unlimited" / "Never".
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

export function printPlan(plan: SetupPlan, previewKey: string): void {
  output.print(chalk.bold('Planned changes\n'));
  for (const change of plan.changes) {
    if (change.status === 'unchanged') {
      output.print(
        `${chalk.dim('=')} ${chalk.dim(`${change.label} (unchanged)`)}  ${chalk.dim(change.path)}\n`
      );
      continue;
    }
    if (change.status === 'error') {
      output.print(
        `${chalk.red('!')} ${chalk.bold(change.label)}  ${chalk.dim(change.path)}\n`
      );
      output.print(chalk.red(`    cannot edit: ${change.error}\n`));
      continue;
    }
    const verb = change.status === 'create' ? 'create' : 'update';
    output.print(
      `${chalk.cyan(verb === 'create' ? '+' : '~')} ${chalk.bold(change.label)} (${verb})  ${chalk.dim(change.path)}\n`
    );
    const diff = renderDiff(change.current ?? '', change.next ?? '', {
      secrets: [previewKey],
    });
    if (diff) {
      output.print(`${diff}\n`);
    }
  }
  output.print('\n');
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
  // Only show a masked form (prefix + last 4) — never print the whole secret to
  // the terminal. The full key lives in the Keychain or the configs above.
  const where = opts.keychain
    ? 'stored in your macOS Keychain'
    : 'written to the configs above';
  output.print('\n');
  output.log(
    chalk.dim(
      `AI Gateway API key ${maskSecret(key)} ${where} — keep it secret.`
    )
  );
}
