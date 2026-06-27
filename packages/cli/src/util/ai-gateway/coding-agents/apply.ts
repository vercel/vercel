import { join } from 'node:path';
import type { CodingAgent, EnvExport, FileFormat, SetupContext } from './types';
import {
  readFileOrNull,
  backupFile,
  writeConfigFile,
  upsertManagedBlock,
} from './config-files';
import { keychainLookup } from './keychain';

export type ChangeStatus = 'create' | 'update' | 'unchanged' | 'error';

export interface PlannedChange {
  path: string;
  label: string;
  format: FileFormat;
  /** Display names of the agents that wanted this file (e.g. shell rc is shared). */
  owners: string[];
  current: string | null;
  next: string | null;
  status: ChangeStatus;
  error?: string;
  /** File mode for newly created files (e.g. 0o600 for credential files). */
  mode?: number;
}

export interface AgentNotes {
  id: string;
  displayName: string;
  notes: string[];
}

export interface SetupPlan {
  changes: PlannedChange[];
  notes: AgentNotes[];
  /** Where the shared env exports were written, if any agent needed them. */
  shellRcPath?: string;
}

/** Picks the shell rc file to manage based on the user's login shell. */
export function detectShellRc(home: string): string {
  const shell = process.env.SHELL ?? '';
  if (shell.includes('zsh')) return join(home, '.zshrc');
  if (shell.includes('bash')) return join(home, '.bashrc');
  return join(home, '.profile');
}

/**
 * POSIX single-quote a value so it is safe in a shell rc file. Single quotes
 * disable all expansion; a literal `'` is emitted as the `'\''` idiom. This
 * prevents a key containing `"`, `$`, backticks, or `\` from breaking the line
 * or being interpreted by the shell.
 */
function shellQuote(value: string): string {
  return `'${value.split("'").join("'\\''")}'`;
}

function envBlockBody(exports: EnvExport[], useKeychain: boolean): string {
  const lines = [
    '# Managed by `vercel ai-gateway coding-agents connect` — safe to remove this block.',
  ];
  for (const e of exports) {
    if (useKeychain) {
      // Resolve the secret from the Keychain at runtime; no plaintext in the rc.
      lines.push(`export ${e.name}="${keychainLookup()}"`);
    } else {
      lines.push(`export ${e.name}=${shellQuote(e.value)}`);
    }
  }
  return lines.join('\n');
}

interface PendingChange {
  path: string;
  label: string;
  format: FileFormat;
  mode?: number;
  owner: string;
  transform(current: string | null): string;
}

/**
 * Builds a concrete, diffable plan from the selected agents: resolves each
 * agent's file changes, consolidates required env vars into a single managed
 * shell-rc block, reads current contents, and computes the resulting status.
 * Pure transforms run here; nothing is written.
 */
export async function buildSetupPlan(
  agents: CodingAgent[],
  ctx: SetupContext
): Promise<SetupPlan> {
  const pending: PendingChange[] = [];
  const envExports: EnvExport[] = [];
  const notes: AgentNotes[] = [];

  for (const agent of agents) {
    const plan = agent.buildPlan(ctx);
    for (const fc of plan.fileChanges) {
      pending.push({ ...fc, owner: agent.displayName });
    }
    for (const ee of plan.envExports) {
      if (!envExports.some(x => x.name === ee.name)) {
        envExports.push(ee);
      }
    }
    if (plan.notes.length) {
      notes.push({
        id: agent.id,
        displayName: agent.displayName,
        notes: plan.notes,
      });
    }
  }

  let shellRcPath: string | undefined;
  if (envExports.length) {
    shellRcPath = detectShellRc(ctx.home);
    const body = envBlockBody(envExports, ctx.useKeychain);
    pending.push({
      path: shellRcPath,
      label: 'Shell environment',
      format: 'shell',
      owner: 'Environment',
      transform: current => upsertManagedBlock(current, body),
    });
  }

  // Group by path so multiple owners of the same file chain their transforms.
  const byPath = new Map<
    string,
    {
      label: string;
      format: FileFormat;
      mode?: number;
      owners: string[];
      transforms: Array<(current: string | null) => string>;
    }
  >();
  for (const p of pending) {
    const entry = byPath.get(p.path) ?? {
      label: p.label,
      format: p.format,
      mode: p.mode,
      owners: [],
      transforms: [],
    };
    if (!entry.owners.includes(p.owner)) entry.owners.push(p.owner);
    entry.transforms.push(p.transform);
    byPath.set(p.path, entry);
  }

  const changes: PlannedChange[] = [];
  for (const [path, entry] of byPath) {
    const current = await readFileOrNull(path);
    let next: string | null = null;
    let status: ChangeStatus;
    let error: string | undefined;
    try {
      let acc: string | null = current;
      for (const transform of entry.transforms) {
        acc = transform(acc);
      }
      next = acc;
      status =
        current === null ? 'create' : next === current ? 'unchanged' : 'update';
    } catch (err) {
      status = 'error';
      error = err instanceof Error ? err.message : String(err);
    }
    changes.push({
      path,
      label: entry.label,
      format: entry.format,
      mode: entry.mode,
      owners: entry.owners,
      current,
      next,
      status,
      error,
    });
  }

  return { changes, notes, shellRcPath };
}

export interface ApplyResult {
  path: string;
  label: string;
  owners: string[];
  action: 'created' | 'updated';
  backupPath?: string;
}

/**
 * Writes the create/update changes to disk, backing up any file that already
 * exists (unless disabled). Unchanged and errored changes are skipped.
 */
export async function applyPlan(
  plan: SetupPlan,
  options: { backup: boolean }
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];
  for (const change of plan.changes) {
    if (
      (change.status !== 'create' && change.status !== 'update') ||
      change.next === null
    ) {
      continue;
    }
    let backupPath: string | undefined;
    if (options.backup && change.current !== null) {
      backupPath = await backupFile(change.path);
    }
    await writeConfigFile(change.path, change.next, change.mode);
    results.push({
      path: change.path,
      label: change.label,
      owners: change.owners,
      action: change.status === 'create' ? 'created' : 'updated',
      backupPath,
    });
  }
  return results;
}
