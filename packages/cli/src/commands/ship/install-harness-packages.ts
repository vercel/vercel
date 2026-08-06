import execa from 'execa';
import { outputJSON, pathExists, readJSON, remove, writeFile } from 'fs-extra';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isError } from '@vercel/error-utils';
import type Client from '../../util/client';
import getGlobalPathConfig from '../../util/config/global-path';
import cmd from '../../util/output/cmd';
import output from '../../output-manager';
import {
  getLocalHarnessSource,
  HARNESS_SOURCE_ENV_VAR,
  packLocalHarnessPackages,
  type LocalHarnessSource,
  type PackedPackage,
} from './local-harness-source';

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
 * Where packages built from a local checkout are installed.
 *
 * Separate from the registry install so switching between the two does not mean
 * one overwriting the other, and so deleting a branch build leaves the normal
 * install intact.
 */
function getLocalPackagesDir(): string {
  return join(getHarnessPackagesDir(), 'local');
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

/**
 * Where the harness runtime came from.
 *
 * `local`    — built from a checkout named by `VERCEL_SHIP_HARNESS_SOURCE`.
 * `bundled`  — resolvable by the CLI itself.
 * `managed`  — installed from the npm registry into the global config directory.
 *
 * Worth carrying because the branch build and the published one currently share
 * a version number, so nothing about the loaded package distinguishes them, and
 * they do not behave the same: only the branch reuses a `claude` the machine
 * already has instead of downloading a second copy.
 */
export type HarnessOrigin = 'local' | 'bundled' | 'managed';

export interface HarnessLoader {
  origin: HarnessOrigin;
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

  // An explicit local checkout wins over everything else: it is only ever set
  // deliberately, and silently preferring a stale registry copy would make the
  // override look broken.
  const localSource = getLocalHarnessSource(client.cwd);
  if (localSource) {
    return installFromLocalSource({ source: localSource, specs, packages });
  }

  // Prefer packages already resolvable by the CLI itself. This is the path taken
  // once these become real dependencies, and by contributors running from the
  // monorepo, and it avoids a redundant managed install.
  const bundled = await tryBundledLoader(specs);
  if (bundled) {
    output.log('Using harness packages bundled with the CLI.');
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

  // Named even though nothing went wrong. Two builds of these packages exist
  // with the same version number and different behaviour, so "which one am I
  // running" has to be answerable from the session's own output.
  output.log(`Using harness packages from the npm registry (${dir}).`);

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
    origin: 'bundled',
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

  return runNpmInstall({ dir, labels: packages, add: packages });
}

/**
 * Run `npm install` in a directory the CLI owns.
 *
 * `add` names packages to install as new dependencies; omitting it installs
 * whatever the manifest already declares, which is how the local-source path
 * works, since its dependencies are tarball paths written ahead of time.
 */
async function runNpmInstall(options: {
  dir: string;
  labels: string[];
  add?: string[];
}): Promise<boolean> {
  const { dir, labels, add = [] } = options;

  output.spinner(`Installing ${labels.join(', ')}`);
  try {
    await execa('npm', ['install', '--no-audit', '--no-fund', ...add], {
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
    const retry = ['npm', 'install', ...add, ...retryFlags(err)].join(' ');
    output.log(`You can retry manually:\n    cd ${dir} && ${retry}`);
    return false;
  }
}

/**
 * Extra flags that would make the retry command succeed.
 *
 * Only offered as something to type by hand. Adding `--min-release-age=0` to
 * the install the CLI runs itself would override a supply-chain control the
 * user deliberately configured, without them seeing it happen.
 */
function retryFlags(err: unknown): string[] {
  return isMinReleaseAgeFailure(err) ? ['--min-release-age=0'] : [];
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
      'They may not be published yet.\n' +
      `Build them from a checkout of vercel/ai and set ${HARNESS_SOURCE_ENV_VAR} ` +
      'to it to use those instead.\n\n' +
      stderr.trim().split('\n').slice(0, 6).join('\n')
    );
  }

  if (isMinReleaseAgeFailure(err)) {
    return (
      'A required version was filtered out by the `min-release-age` setting ' +
      'in your npmrc, which hides recently published packages.\n\n' +
      stderr.trim().split('\n').slice(0, 6).join('\n')
    );
  }

  return (stderr || message).trim().split('\n').slice(0, 10).join('\n');
}

/**
 * Whether npm refused a version only because it is too new.
 *
 * `min-release-age` hides packages published in the last few days, which is
 * exactly what a freshly built branch depends on. npm reports it as an ordinary
 * "no matching version", so it has to be recognised by the date it appends.
 */
function isMinReleaseAgeFailure(err: unknown): boolean {
  const stderr =
    typeof (err as { stderr?: unknown })?.stderr === 'string'
      ? (err as { stderr: string }).stderr
      : '';
  const message = isError(err) ? err.message : String(err);
  return /min-release-age|with a date before/.test(`${stderr}${message}`);
}

/**
 * Build the harness packages out of a local `ai` checkout and install them.
 *
 * Runs without a confirmation prompt: setting `VERCEL_SHIP_HARNESS_SOURCE` is
 * already the explicit act of asking for this, and the install is repeated on
 * every rebuild.
 */
async function installFromLocalSource(options: {
  source: LocalHarnessSource;
  specs: HarnessPackageSpecs;
  packages: string[];
}): Promise<HarnessLoader | undefined> {
  const { source, specs, packages } = options;
  const dir = getLocalPackagesDir();

  output.log(
    `Using harness packages built from ${source.root} ` +
      `(${HARNESS_SOURCE_ENV_VAR}).`
  );

  const packed = await packLocalHarnessPackages({
    source,
    packages,
    destination: join(dir, 'tarballs'),
  });
  if (!packed) {
    return undefined;
  }

  if (!(await syncLocalManifest(dir, packed))) {
    return undefined;
  }

  return createManagedLoader(dir, specs, 'local');
}

/**
 * Write the manifest describing the packed tarballs and install it if it moved.
 *
 * Every package is pinned in `overrides` as well as `dependencies`, because the
 * adapter depends on `@ai-sdk/harness` by version and npm would otherwise be
 * free to satisfy that from the registry — quietly loading a published build
 * alongside the branch one being tested. npm rejects an override that disagrees
 * with a direct dependency, so the two specs are written from the same value.
 *
 * The manifest also records each tarball's content hash — npm ignores the
 * extra field — because the paths alone cannot signal a rebuild: they embed
 * the package version, and a rebuilt branch keeps its version. Comparing only
 * the pins therefore skipped the install after every repack, and the runtime
 * kept executing the previous build while the tarballs on disk carried the
 * fix being tested. When the hashes move, `node_modules` and the lockfile are
 * cleared first: npm resolves an unchanged `file:` spec of the same version
 * from its lockfile and cache, so a plain install can quietly keep the stale
 * copy.
 */
async function syncLocalManifest(
  dir: string,
  packed: PackedPackage[]
): Promise<boolean> {
  const pins = Object.fromEntries(
    packed.map(entry => [entry.name, `file:${entry.tarball}`])
  );
  const manifest = {
    private: true,
    license: 'UNLICENSED',
    dependencies: pins,
    overrides: pins,
    shipTarballHashes: Object.fromEntries(
      await Promise.all(
        packed.map(async entry => [entry.name, await hashFile(entry.tarball)])
      )
    ),
  };

  const manifestPath = join(dir, 'package.json');
  const unchanged =
    (await pathExists(join(dir, 'node_modules'))) &&
    JSON.stringify(await readJSON(manifestPath).catch(() => null)) ===
      JSON.stringify(manifest);

  if (unchanged) {
    output.debug('ship: local harness packages already installed');
    return true;
  }

  await Promise.all([
    remove(join(dir, 'node_modules')),
    remove(join(dir, 'package-lock.json')),
  ]);
  await outputJSON(manifestPath, manifest, { spaces: 2 });
  return runNpmInstall({ dir, labels: packed.map(entry => entry.name) });
}

async function hashFile(path: string): Promise<string> {
  // Hex avoids a Buffer/typed-array variance clash between the repo's TS lib
  // and the bundled node types; the content is hashed either way.
  return createHash('sha256')
    .update(await readFile(path, 'hex'), 'hex')
    .digest('hex');
}

async function createManagedLoader(
  dir: string,
  specs: HarnessPackageSpecs,
  origin: HarnessOrigin = 'managed'
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

  const loader = (await import(pathToFileURL(loaderPath).href)) as Omit<
    HarnessLoader,
    'origin'
  >;

  output.debug(`ship: harness runtime loaded from ${dir} (${origin})`);

  return { ...loader, origin };
}
