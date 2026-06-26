import chalk from 'chalk';
import type Client from '../../client';
import output from '../../../output-manager';
import {
  printAlignedLabel,
  ALIGNED_LABEL_WIDTH,
} from '../../output/print-aligned-label';
import { renderDiff } from './diff';
import type { SetupPlan } from './apply';
import type { CodingAgent } from './types';

/**
 * Prints a dimmed, indented detail row nested under the row above it, with its
 * value aligned to the same column as the top-level rows. Used to show a key's
 * quota and expiry as children of the "API key" row.
 */
function printChildLabel(label: string, value: string): void {
  // Top-level values sit at column `2 (gutter) + ALIGNED_LABEL_WIDTH`. Indent
  // the child label by 2 and shrink its padding by 2 so values stay aligned.
  const indent = '    ';
  output.print(
    `${indent}${chalk.dim(label.padEnd(ALIGNED_LABEL_WIDTH - 2))}${chalk.dim(value)}\n`
  );
}

export function printResolvedState(args: {
  selected: CodingAgent[];
  willCreate: boolean;
  name?: string;
  budget?: number;
  refreshPeriod?: string;
  expiresAt?: number;
}): void {
  const { selected, willCreate, name, budget, refreshPeriod, expiresAt } = args;
  output.print(chalk.bold('Summary\n'));
  printAlignedLabel('Agents', selected.map(a => a.displayName).join(', '));
  if (!willCreate) {
    printAlignedLabel('API key', 'Using provided key');
    output.print('\n');
    return;
  }
  // Show the key name on the parent row, then nest its quota and expiry as
  // dimmed child rows so it's clear they configure this one key.
  printAlignedLabel(
    'API key',
    name ? `Creating new key "${name}"` : 'Creating new key'
  );
  if (budget !== undefined) {
    // Group the quota as <amount>/<period>, e.g. $500/daily (or just $500 for a
    // one-time limit with no refresh).
    const period =
      refreshPeriod && refreshPeriod !== 'none' ? refreshPeriod : '';
    printChildLabel(
      'Spend limit',
      period ? `$${budget}/${period}` : `$${budget}`
    );
  }
  if (expiresAt !== undefined) {
    printChildLabel('Expires', new Date(expiresAt).toISOString().slice(0, 10));
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

export function printKey(client: Client, key: string): void {
  output.print('\n');
  output.log(
    chalk.dim(
      'AI Gateway API key (also written to the configs above) — keep it secret:'
    )
  );
  // Raw key on stdout so it can be captured/piped.
  client.stdout.write(`${key}\n`);
}
