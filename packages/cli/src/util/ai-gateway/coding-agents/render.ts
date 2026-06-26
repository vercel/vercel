import chalk from 'chalk';
import type Client from '../../client';
import output from '../../../output-manager';
import { printAlignedLabel } from '../../output/print-aligned-label';
import { renderDiff } from './diff';
import type { SetupPlan } from './apply';
import type { CodingAgent } from './types';

export function printResolvedState(args: {
  selected: CodingAgent[];
  model: string;
  willCreate: boolean;
  name?: string;
  budget?: number;
  refreshPeriod?: string;
  expiresAt?: number;
}): void {
  const {
    selected,
    model,
    willCreate,
    name,
    budget,
    refreshPeriod,
    expiresAt,
  } = args;
  output.print('\n');
  printAlignedLabel('Agents', selected.map(a => a.displayName).join(', '));
  printAlignedLabel('Model', model);
  let keyState = 'Using provided key';
  if (willCreate) {
    const parts: string[] = [];
    if (name) parts.push(`"${name}"`);
    if (budget !== undefined) parts.push(`$${budget}`);
    if (refreshPeriod && refreshPeriod !== 'none') parts.push(refreshPeriod);
    if (expiresAt !== undefined) {
      parts.push(`expires ${new Date(expiresAt).toISOString().slice(0, 10)}`);
    }
    keyState = parts.length
      ? `Creating new key (${parts.join(', ')})`
      : 'Creating new key';
  }
  printAlignedLabel('API key', keyState);
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
