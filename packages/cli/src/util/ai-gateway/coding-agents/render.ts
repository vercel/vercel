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
    // The write follows the symlink to its target; surface that before approval.
    if (change.symlink) {
      output.print(
        `    ${chalk.yellow('↳ warning:')} this path is a symlink — the write will follow it to its target\n`
      );
    }
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

export function printKeyRow(
  key: string,
  opts: { keychain?: boolean; created?: boolean } = {}
): void {
  printAlignedLabel(
    opts.created ? 'New API Key' : 'API Key',
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

export function printKey(
  key: string,
  opts: { keychain?: boolean; created?: boolean } = {}
): void {
  output.print('\n');
  printKeyRow(key, opts);
}

export function buildAgentPrompt(plan: SetupPlan, apiKey: string): string {
  const sections: string[] = [
    'Set up the Vercel AI Gateway for my coding agents by applying the file changes below.',
    'For each file, create it if missing or edit it to match the diff (lines starting with `+` are added, `-` are removed; `⋯` marks skipped unchanged lines).',
    `Any masked value (e.g. ${maskSecret(apiKey)}) is my AI Gateway API key, stored in my macOS Keychain; the config and shell already reference it with \`${'security find-generic-password'}\`, so leave those lookups as-is and do not ask me to paste the key.`,
    '',
  ];
  for (const change of plan.changes) {
    if (change.status !== 'create' && change.status !== 'update') {
      continue;
    }
    const diff = renderDiff(change.current ?? '', change.next ?? '', {
      secrets: [apiKey],
      indent: '',
      color: false,
    });
    sections.push(`# ${change.label} — ${change.path}`);
    if (diff) {
      sections.push(diff);
    }
    sections.push('');
  }
  return `${sections.join('\n').trimEnd()}\n`;
}
