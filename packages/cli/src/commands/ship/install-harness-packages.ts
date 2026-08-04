import execa from 'execa';
import { outputJSON, pathExists, writeFile } from 'fs-extra';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isError } from '@vercel/error-utils';
import type Client from '../../util/client';
import getGlobalPathConfig from '../../util/config/global-path';
import cmd from '../../util/output/cmd';
import output from '../../output-manager';

/**
 * Directory the CLI owns for harness runtime packages.
 *
 * These live under the global Vercel config directory rather than the user's
 * project, because a coding agent runtime is machine-level tooling: installing
 * it into `<project>/.vercel` would add weight to every repo the user ships and
 * be re-downloaded per project.
 */
export function getHarnessPackagesDir(): string {
  return join(getGlobalPathConfig(), 'harnesses');
}

/**
 * Generated ESM shim used to import harness packages.
 *
 * Node resolves bare specifiers relative to the importing file, so a shim that
 * sits next to the managed `node_modules` resolves these packages correctly
 * regardless of where the CLI itself is installed. Resolving by hand would mean
 * reimplementing `exports` map resolution, which breaks on subpath exports such
 * as `@ai-sdk/harness/agent`.
 */
const LOADER_FILENAME = 'load-harness.mjs';

/**
 * Held in variables so the specifiers stay runtime-resolved. `ai` is not a
 * dependency of the CLI — it is resolved from the harness tree — so a literal
 * specifier would fail type-checking and bundling.
 */
const AI_PACKAGE = 'ai';
const ZOD_PACKAGE = 'zod';

export interface HarnessPackageSpecs {
  /**
   * `@ai-sdk/harness` — the agent runtime. It also provides the local workspace
   * sandbox, used implicitly when no `sandbox` provider is supplied.
   */
  core: string;
  /** The harness-specific adapter, e.g. `@ai-sdk/harness-claude-code`. */
  adapter: string;
}

export interface HarnessLoader {
  loadCore: () => Promise<Record<string, unknown>>;
  loadAdapter: () => Promise<Record<string, unknown>>;
  /**
   * `ai` and `zod` come from the same tree as the harness rather than from the
   * CLI's own dependencies, so the tool helper and the schema library are
   * guaranteed to be the versions the harness itself was built against.
   */
  loadAi: () => Promise<Record<string, unknown>>;
  loadZod: () => Promise<Record<string, unknown>>;
}

/**
 * Ensure the packages needed to run a harness session are present, installing
 * them with the user's approval when they are not, and return a loader for them.
 *
 * Returns `undefined` when the packages are unavailable and could not be
 * installed; the caller reports the failure and exits.
 */
export async function ensureHarnessPackages(options: {
  client: Client;
  specs: HarnessPackageSpecs;
  harnessLabel: string;
  /** Skip the approval prompt (`--yes`). */
  autoApprove: boolean;
}): Promise<HarnessLoader | undefined> {
  const { client, specs, harnessLabel, autoApprove } = options;
  const packages = [specs.core, specs.adapter];

  // Prefer packages already resolvable by the CLI itself. This is the path taken
  // once these become real dependencies, and by contributors running from the
  // monorepo, and it avoids a redundant managed install.
  const bundled = await tryBundledLoader(specs);
  if (bundled) {
    output.debug('ship: using harness packages resolvable from the CLI');
    return bundled;
  }

  const dir = getHarnessPackagesDir();
  const missing = await findMissingPackages(dir, packages);

  if (missing.length > 0) {
    const approved = await confirmInstall({
      client,
      harnessLabel,
      missing,
      dir,
      autoApprove,
    });
    if (!approved) {
      return undefined;
    }

    const installed = await installPackages(dir, missing);
    if (!installed) {
      return undefined;
    }
  }

  return createManagedLoader(dir, specs);
}

async function tryBundledLoader(
  specs: HarnessPackageSpecs
): Promise<HarnessLoader | undefined> {
  try {
    // Probe the core package only. If the CLI can resolve it, it can resolve the
    // others that were installed alongside it.
    await import(`${specs.core}/agent`);
  } catch {
    return undefined;
  }

  return {
    loadCore: () => import(`${specs.core}/agent`),
    loadAdapter: () => import(specs.adapter),
    loadAi: () => import(AI_PACKAGE),
    loadZod: () => import(ZOD_PACKAGE),
  };
}

async function findMissingPackages(
  dir: string,
  packages: string[]
): Promise<string[]> {
  const missing: string[] = [];
  for (const name of packages) {
    if (!(await pathExists(join(dir, 'node_modules', name, 'package.json')))) {
      missing.push(name);
    }
  }
  return missing;
}

async function confirmInstall(options: {
  client: Client;
  harnessLabel: string;
  missing: string[];
  dir: string;
  autoApprove: boolean;
}): Promise<boolean> {
  const { client, harnessLabel, missing, dir, autoApprove } = options;

  if (autoApprove) {
    return true;
  }

  output.log(
    `Running a ${harnessLabel} session needs the following ${
      missing.length === 1 ? 'package' : 'packages'
    }:`
  );
  for (const name of missing) {
    output.print(`    ${name}\n`);
  }
  output.print('\n');
  output.log(`They will be installed into ${dir}`);
  output.log('Your project is not modified.');
  output.print('\n');

  if (!client.stdin.isTTY) {
    output.error(
      `Cannot prompt for approval in non-interactive mode. Re-run with ${cmd(
        '--yes'
      )} to install them automatically.`
    );
    return false;
  }

  return client.input.confirm('Install them now?', true);
}

async function installPackages(
  dir: string,
  packages: string[]
): Promise<boolean> {
  // A private manifest keeps npm from walking up and treating an ancestor
  // directory as the install target.
  try {
    await outputJSON(
      join(dir, 'package.json'),
      { private: true, license: 'UNLICENSED' },
      { flag: 'wx' }
    );
  } catch (err) {
    if (!isError(err) || (err as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw err;
    }
  }

  output.spinner(`Installing ${packages.join(', ')}`);
  try {
    await execa('npm', ['install', '--no-audit', '--no-fund', ...packages], {
      cwd: dir,
      stdio: 'pipe',
      reject: true,
    });
    output.stopSpinner();
    output.log('Installed.');
    return true;
  } catch (err) {
    output.stopSpinner();
    output.error(
      `Failed to install harness packages.\n\n${formatInstallError(err)}`
    );
    output.log(
      `You can retry manually:\n    cd ${dir} && npm install ${packages.join(
        ' '
      )}`
    );
    return false;
  }
}

/**
 * Surface the useful part of an npm failure.
 *
 * A 404 is called out explicitly because these packages are still being
 * published, and "not found in the registry" is otherwise buried in npm noise.
 */
function formatInstallError(err: unknown): string {
  const stderr =
    typeof (err as { stderr?: unknown })?.stderr === 'string'
      ? ((err as { stderr: string }).stderr as string)
      : '';
  const message = isError(err) ? err.message : String(err);

  if (/E404|404 Not Found/.test(stderr) || /E404/.test(message)) {
    return (
      'One or more packages were not found in the npm registry. ' +
      'They may not be published yet.\n\n' +
      stderr.trim().split('\n').slice(0, 6).join('\n')
    );
  }

  return (stderr || message).trim().split('\n').slice(0, 10).join('\n');
}

async function createManagedLoader(
  dir: string,
  specs: HarnessPackageSpecs
): Promise<HarnessLoader> {
  const loaderPath = join(dir, LOADER_FILENAME);
  await writeFile(
    loaderPath,
    [
      '// Generated by `vercel ship`. Safe to delete.',
      `export const loadCore = () => import(${JSON.stringify(`${specs.core}/agent`)});`,
      `export const loadAdapter = () => import(${JSON.stringify(specs.adapter)});`,
      "export const loadAi = () => import('ai');",
      "export const loadZod = () => import('zod');",
      '',
    ].join('\n'),
    'utf-8'
  );

  return (await import(pathToFileURL(loaderPath).href)) as HarnessLoader;
}
