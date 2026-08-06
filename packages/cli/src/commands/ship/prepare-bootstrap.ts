import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathExists, readFile, outputFile, remove } from 'fs-extra';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import output from '../../output-manager';
import type { HarnessId } from './detect-harnesses';

/**
 * Directory a bridge-backed harness bootstraps into, relative to the sandbox
 * root. The implicit local workspace roots the sandbox at the working directory
 * itself, so this sits inside the user's project. The harness writes a
 * `.gitignore` of `*` into it, so it stays out of `git status`.
 */
const BOOTSTRAP_ROOT = '.harness-bootstrap';

const PNPM_WORKSPACE_FILE = 'pnpm-workspace.yaml';

/**
 * Written by the bridge install when it decided to drive a `claude` that was
 * already on the machine rather than downloading the pinned one. It holds the
 * path of the executable it chose.
 */
const REUSED_EXECUTABLE_MARKER = '.reused-executable';

/** Grants pnpm permission to run dependency build scripts in this directory. */
const ALLOW_BUILDS = 'dangerouslyAllowAllBuilds: true\n';

const execFileAsync = promisify(execFile);

/** The bridge executable prints its version quickly, or it is broken. */
const BRIDGE_PROBE_TIMEOUT_MS = 15_000;

/**
 * Marker of the placeholder pnpm writes when it refuses to run a build script.
 * Once this lands in the file every later install fails, so it must be replaced
 * rather than left alone.
 */
const PNPM_PLACEHOLDER = 'set this to true or false';

/** Harnesses that bootstrap a bridge with pnpm. */
const PNPM_BOOTSTRAP_HARNESSES: ReadonlySet<HarnessId> = new Set([
  'claude-code',
]);

/**
 * Pre-authorize dependency build scripts for a harness bridge install.
 *
 * Bridge-backed adapters bootstrap by running `pnpm install --frozen-lockfile`
 * in their own directory, and ship no pnpm configuration with it. In a hosted
 * sandbox image that is fine. On a developer machine, pnpm 10+ refuses to run
 * dependency build scripts it has not been told to trust, exits non-zero, and
 * writes a placeholder `pnpm-workspace.yaml` that makes every subsequent attempt
 * fail the same way. `@anthropic-ai/claude-code` needs its `postinstall` to run,
 * so the bootstrap can never succeed without this.
 *
 * Writing the permission ahead of time keeps the failure from happening at all.
 * This only ever touches files under the workspace's `.harness-bootstrap/`, which
 * the harness owns and keeps out of git, and is a no-op for harnesses that do not
 * bootstrap with pnpm.
 *
 * Remove once the adapters ship their own pnpm configuration.
 */
/** Absolute path of a harness's bootstrap directory for a workspace. */
function bootstrapDirFor(workspace: string, harnessId: HarnessId): string {
  return join(workspace, BOOTSTRAP_ROOT, harnessId);
}

/**
 * Whether this harness has already been bootstrapped in this workspace.
 *
 * A bridge-backed adapter installs its bridge with `pnpm install` into the
 * bootstrap directory, and pins a project-local pnpm store, so the first run in
 * a project downloads hundreds of megabytes and takes a minute or more. Knowing
 * in advance lets the caller say so rather than showing a bare spinner.
 */
export async function isHarnessBootstrapped(options: {
  harnessId: HarnessId;
  workspace: string;
}): Promise<boolean> {
  if (!PNPM_BOOTSTRAP_HARNESSES.has(options.harnessId)) {
    return true;
  }
  return pathExists(
    join(bootstrapDirFor(options.workspace, options.harnessId), 'node_modules')
  );
}

export async function prepareHarnessBootstrap(options: {
  harnessId: HarnessId;
  /** Absolute path to the directory the agent is scoped to. */
  workspace: string;
}): Promise<void> {
  const { harnessId, workspace } = options;

  if (!PNPM_BOOTSTRAP_HARNESSES.has(harnessId)) {
    return;
  }

  // The sandbox root is the workspace itself, so the bootstrap directory sits
  // inside it.
  const bootstrapDir = bootstrapDirFor(workspace, harnessId);
  const configPath = join(bootstrapDir, PNPM_WORKSPACE_FILE);

  // Before anything else: a previous install may have been interrupted, and the
  // config paths below return early once they find their file already in place.
  await repairIncompleteBootstrap(bootstrapDir);

  try {
    if (await pathExists(configPath)) {
      const existing = await readFile(configPath, 'utf-8');

      if (existing.includes(PNPM_PLACEHOLDER)) {
        await outputFile(configPath, ALLOW_BUILDS, 'utf-8');
        output.debug(
          `ship: replaced the pnpm build-approval placeholder in ${configPath}`
        );
        return;
      }

      output.debug(`ship: ${configPath} already present, leaving it alone`);
      return;
    }

    await outputFile(configPath, ALLOW_BUILDS, 'utf-8');
    output.debug(`ship: pre-authorized harness bridge builds in ${configPath}`);
  } catch (err) {
    // Never block a session on this. If it fails, the adapter's own bootstrap
    // error is the more useful thing for the user to see.
    output.debug(
      `ship: could not prepare the harness bootstrap directory: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

/**
 * Clear a half-installed bridge so the adapter's `pnpm install` rebuilds it.
 *
 * The bootstrap installs with `--frozen-lockfile`, so pnpm treats the tree as
 * satisfied whenever it matches the lockfile. Optional dependencies that fail to
 * download are skipped without failing the install, which is how a transient
 * registry problem leaves the platform-native package registered but absent. The
 * adapter's postinstall then cannot find it, and because the lockfile still
 * matches, every later run repeats the same failure with no way out.
 *
 * The check is the same one the adapter's own bootstrap performs last — run the
 * installed executable — because that is what has to work, and inspecting the
 * package layout gives false positives: pnpm hoists some payloads into
 * `.pnpm/node_modules`, leaving a legitimately empty directory behind.
 *
 * Only `node_modules` is removed. The package store beside it is kept, so a
 * rebuild is served from cache rather than downloaded again.
 */
async function repairIncompleteBootstrap(bootstrapDir: string): Promise<void> {
  const modulesDir = join(bootstrapDir, 'node_modules');

  try {
    const executable = await installedExecutable(bootstrapDir);
    if (!executable) {
      // Either nothing is installed yet, or the install never got far enough to
      // link a binary. Both are handled by letting the bootstrap run.
      return;
    }

    await execFileAsync(executable, ['--version'], {
      timeout: BRIDGE_PROBE_TIMEOUT_MS,
      windowsHide: true,
    });
  } catch (err) {
    output.debug(
      `ship: the installed bridge is not runnable (${
        err instanceof Error ? err.message.split('\n')[0] : String(err)
      }); clearing node_modules so it is reinstalled`
    );
    await remove(modulesDir).catch(() => {});
    // The framework skips the bootstrap while its completion marker exists,
    // so a wipe that leaves the marker behind is a deadlock: node_modules
    // gone, recipe "already applied", every session start crashing in the
    // bridge. The marker goes with the tree it vouched for.
    await removeBootstrapMarkers(bootstrapDir);
  }
}

/** Delete the framework's `.bootstrap-<identity>.ok` markers, best effort. */
async function removeBootstrapMarkers(bootstrapDir: string): Promise<void> {
  try {
    for (const entry of await readdir(bootstrapDir)) {
      if (entry.startsWith('.bootstrap-') && entry.endsWith('.ok')) {
        await remove(join(bootstrapDir, entry)).catch(() => {});
      }
    }
  } catch {
    // No directory, nothing to unmark.
  }
}

/**
 * The `claude` the installed bridge would actually run, if there is one.
 *
 * The install has two outcomes. It either downloaded the pinned executable, in
 * which case `node_modules/.bin/claude` is the thing to probe, or it reused one
 * already on the machine and recorded its path in a marker file. Probing the
 * linked binary in that second case would always fail — the install skipped the
 * optional dependency that provides it — and would wipe a perfectly good tree
 * on every run.
 */
async function installedExecutable(
  bootstrapDir: string
): Promise<string | undefined> {
  const markerPath = join(bootstrapDir, REUSED_EXECUTABLE_MARKER);

  if (await pathExists(markerPath)) {
    const recorded = (await readFile(markerPath, 'utf-8')).trim();
    // An empty marker means the install recorded nothing useful; treat the
    // bootstrap as incomplete rather than trusting it.
    return recorded || join(bootstrapDir, 'node_modules', '.bin', 'claude');
  }

  const linked = join(bootstrapDir, 'node_modules', '.bin', 'claude');
  return (await pathExists(linked)) ? linked : undefined;
}
