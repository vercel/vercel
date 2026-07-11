import { join } from 'node:path';
import type { CodingAgent, EnvExport, FileFormat, SetupContext } from './types';
import {
  readFileOrNull,
  backupFile,
  writeConfigFile,
  upsertManagedBlock,
} from './config-files';

export type ChangeStatus = 'create' | 'update' | 'unchanged' | 'error';

export interface PlannedChange {
  path: string;
  label: string;
  format: FileFormat;
  owners: string[];
  current: string | null;
  next: string | null;
  status: ChangeStatus;
  error?: string;
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
  shellRcPath?: string;
}

export function detectShellRc(home: string, override?: string): string {
  if (override && override.trim()) return override;
  const shell = process.env.SHELL ?? '';
  if (shell.includes('fish')) {
    const xdg = process.env.XDG_CONFIG_HOME;
    const base = xdg && xdg.startsWith('/') ? xdg : join(home, '.config');
    return join(base, 'fish', 'config.fish');
  }
  if (shell.includes('zsh')) {
    // Honor ZDOTDIR, where zsh users relocate their rc files.
    const zdot = process.env.ZDOTDIR;
    return join(zdot && zdot.trim() ? zdot : home, '.zshrc');
  }
  if (shell.includes('bash')) {
    // macOS starts login shells, which read ~/.bash_profile, not ~/.bashrc.
    return join(
      home,
      process.platform === 'darwin' ? '.bash_profile' : '.bashrc'
    );
  }
  return join(home, '.profile');
}

function shellQuote(value: string): string {
  return `'${value.split("'").join("'\\''")}'`;
}

function fishQuote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function envBlockBody(exports: EnvExport[], fish: boolean): string {
  const lines = [
    '# Managed by `vercel ai-gateway coding-agents setup` — safe to remove this block.',
  ];
  for (const e of exports) {
    lines.push(
      fish
        ? `set -gx ${e.name} ${fishQuote(e.value)}`
        : `export ${e.name}=${shellQuote(e.value)}`
    );
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
    shellRcPath = detectShellRc(ctx.home, ctx.shellRcOverride);
    const body = envBlockBody(envExports, shellRcPath.endsWith('.fish'));
    pending.push({
      path: shellRcPath,
      label: 'Shell environment',
      format: 'shell',
      owner: 'Environment',
      transform: current => upsertManagedBlock(current, body),
    });
  }

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
