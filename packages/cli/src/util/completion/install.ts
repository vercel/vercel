import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { packageName } from '../pkg-name';
import {
  SUPPORTED_SHELLS,
  type SupportedShell,
  completionScript,
  isSupportedShell,
} from './scripts';

function xdgConfigHome(): string {
  return process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
}

function xdgDataHome(): string {
  return process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
}

/**
 * Standard per-shell autoload locations. Dropping a file here is picked up with
 * no rc-file edits: fish and bash-completion autoload by filename; zsh autoloads
 * `_vercel` when its directory is on `$fpath` (see `fpathHintFor`). bash needs a
 * file per command name, since bash-completion lazy-loads by the completed word.
 */
export function completionTargetPaths(shell: SupportedShell): string[] {
  switch (shell) {
    case 'fish':
      return [join(xdgConfigHome(), 'fish', 'completions', 'vercel.fish')];
    case 'bash':
      return [
        join(xdgDataHome(), 'bash-completion', 'completions', 'vercel'),
        join(xdgDataHome(), 'bash-completion', 'completions', 'vc'),
      ];
    case 'zsh':
      return [join(xdgDataHome(), 'zsh', 'site-functions', '_vercel')];
  }
}

/**
 * zsh only loads an autoloaded completion when its directory is on `$fpath`,
 * which we can't guarantee from a non-interactive process. Returns the line the
 * user can add to `~/.zshrc` (before `compinit`) if completions don't load.
 */
export function fpathHintFor(shell: SupportedShell): string | undefined {
  if (shell !== 'zsh') {
    return undefined;
  }
  const dir = dirname(completionTargetPaths('zsh')[0]);
  return `fpath=(${dir} $fpath)`;
}

/** Resolves the target shell from an explicit arg or the `$SHELL` basename. */
export function detectShell(explicit?: string): SupportedShell | undefined {
  if (explicit) {
    return isSupportedShell(explicit) ? explicit : undefined;
  }
  const shellPath = process.env.SHELL;
  if (!shellPath) {
    return undefined;
  }
  const base = shellPath.split('/').pop() ?? '';
  return isSupportedShell(base) ? base : undefined;
}

/** Writes the completion script(s) for a shell, returning the paths written. */
export async function writeCompletionFiles(
  shell: SupportedShell
): Promise<string[]> {
  const script = completionScript(shell, packageName);
  const paths = completionTargetPaths(shell);
  for (const path of paths) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, script, 'utf8');
  }
  return paths;
}

/** Shells that already have a vercel completion file installed. */
export function installedShells(): SupportedShell[] {
  return SUPPORTED_SHELLS.filter(shell =>
    completionTargetPaths(shell).some(path => existsSync(path))
  );
}

/**
 * Rewrites completion files for shells that already have them installed. Used
 * after a successful upgrade to keep installs current; never creates a
 * first-time install. Best-effort: individual write failures are swallowed so
 * they can't break the upgrade.
 */
export async function refreshInstalledCompletions(): Promise<SupportedShell[]> {
  const shells = installedShells();
  const refreshed: SupportedShell[] = [];
  for (const shell of shells) {
    try {
      await writeCompletionFiles(shell);
      refreshed.push(shell);
    } catch {
      // Ignore: a read-only or missing dir must never fail the upgrade.
    }
  }
  return refreshed;
}
