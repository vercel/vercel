import fs from 'fs';
import { join } from 'path';
import execa from 'execa';
import { ge, valid } from '@renovatebot/pep440';
import { debug, readConfigFile } from '@vercel/build-utils';
import {
  normalizePackageName,
  parsePep508,
  parseUvLock,
} from '@vercel/python-analysis';
import type { PythonPackage } from '@vercel/python-analysis';
import type { UvRunner } from './uv';

/**
 * Distributions that can provide the `vercel.workflow` import namespace:
 * the standalone `vercel-workflow` runtime, and the umbrella `vercel` SDK
 * that shipped it before it was split out. Ordered by precedence — when both
 * are present the runtime's own version is the one that describes what will
 * actually serve, since the umbrella just depends on it.
 */
export const WORKFLOW_SDK_DISTRIBUTIONS = [
  'vercel-workflow',
  'vercel',
] as const;

export type WorkflowSdkDistribution =
  (typeof WORKFLOW_SDK_DISTRIBUTIONS)[number];

/**
 * The first release of each distribution whose `vercel.workflow` subsystem
 * runs on `vercel-queue` instead of `vercel-workers`. Older releases (and
 * projects where the version cannot be determined) must be served through
 * the legacy vercel-workers integration. The two numbering lines are
 * unrelated: `vercel-workflow` starts its own at 0.9.0 — every release it
 * has — while the umbrella `vercel` crossed over at 0.8.0.
 */
export const MIN_QUEUE_WORKFLOW_SDK_VERSION: Record<
  WorkflowSdkDistribution,
  string
> = {
  'vercel-workflow': '0.9.0',
  vercel: '0.8.0',
};

/** Human-readable form of the above, for build errors. */
export const QUEUE_WORKFLOW_SDK_REQUIREMENT = WORKFLOW_SDK_DISTRIBUTIONS.map(
  distribution =>
    `${distribution}>=${MIN_QUEUE_WORKFLOW_SDK_VERSION[distribution]}`
).join(' or ');

/** An installed distribution and the version of it that is installed. */
export interface InstalledDistribution<T extends string = string> {
  distribution: T;
  version: string;
}

/** An installed workflow runtime, tagged with the distribution it came from. */
export type WorkflowSdkVersion = InstalledDistribution<WorkflowSdkDistribution>;

/**
 * How workflow (and worker) entrypoints are served at runtime:
 * - 'queue': via `vercel.queue.asgi_app()` with introspected subscriptions.
 * - 'workers': via the legacy vercel-workers bootstrap keyed on
 *   VERCEL_SERVICE_TYPE / VERCEL_HAS_WORKER_SERVICES.
 */
export type WorkflowServingMode = 'queue' | 'workers';

/**
 * A script that prints one `<distribution> <version>` line per installed
 * distribution, skipping the ones that are not installed.
 */
function versionQueryScript(distributions: readonly string[]): string {
  return [
    'import importlib.metadata, sys',
    `for name in (${distributions.map(name => `"${name}"`).join(', ')},):`,
    '    try:',
    '        version = importlib.metadata.version(name)',
    '    except importlib.metadata.PackageNotFoundError:',
    '        continue',
    '    sys.stdout.write(name + " " + version + "\\n")',
  ].join('\n');
}

function parseVersionQueryOutput<T extends string>(
  stdout: string,
  distributions: readonly T[]
): Map<T, string> {
  const installed = new Map<T, string>();
  for (const line of stdout.split('\n')) {
    const [name, version] = line.trim().split(/\s+/);
    const distribution = distributions.find(candidate => candidate === name);
    if (distribution && version && valid(version)) {
      installed.set(distribution, version);
    }
  }
  return installed;
}

/**
 * The first of `distributions` that `installed` has a version for — for
 * callers whose distributions are alternatives rather than a set to report.
 */
export function pickInstalledDistribution<T extends string>(
  installed: Map<T, string>,
  distributions: readonly T[]
): InstalledDistribution<T> | undefined {
  for (const distribution of distributions) {
    const version = installed.get(distribution);
    if (version) {
      return { distribution, version };
    }
  }
  return undefined;
}

async function getDeclaredDependencyNames(
  dependencies: unknown
): Promise<Set<string> | undefined> {
  if (!Array.isArray(dependencies)) {
    return undefined;
  }
  const parsed = await parsePep508(
    dependencies.filter(dep => typeof dep === 'string')
  );
  return new Set(
    parsed
      .filter(dep => dep !== null)
      .map(dep => normalizePackageName(dep.name))
  );
}

/**
 * Whether the project declares a direct dependency on the legacy
 * `vercel-workers` SDK, which opts it into the pre-vercel-queue worker
 * integration (legacy subscriber schema, worker env markers, injected
 * vercel-workers). Reads pyproject.toml directly so it can be used at
 * parse time, before any virtual environment exists.
 */
export async function isLegacyWorkersProject(
  workPath: string
): Promise<boolean> {
  const pyprojectPath = join(workPath, 'pyproject.toml');
  if (!fs.existsSync(pyprojectPath)) {
    return false;
  }
  const pyproject = await readConfigFile<{
    project?: { dependencies?: unknown };
  }>(pyprojectPath);
  const names = await getDeclaredDependencyNames(
    pyproject?.project?.dependencies
  );
  return names?.has('vercel-workers') ?? false;
}

/**
 * Whether the project declares an explicit dependency on a package that
 * provides `vercel.workflow` — either the standalone `vercel-workflow`
 * runtime or the umbrella `vercel` SDK that depends on it.
 */
export async function hasExplicitWorkflowSdkDependency(
  pythonPackage: PythonPackage | undefined
): Promise<boolean> {
  const names = await getDeclaredDependencyNames(
    pythonPackage?.manifest?.data?.project?.dependencies
  );
  return WORKFLOW_SDK_DISTRIBUTIONS.some(
    distribution => names?.has(distribution) ?? false
  );
}

/**
 * Local SDK source override, a-la VERCEL_RUNTIME_PYTHON: when
 * VERCEL_SDK_PYTHON points at a `vercel-py` workspace checkout, return the
 * workspace member directories to reinstall over the released `vercel` and
 * `vercel-*` packages. When the project depends on `vercel`, all `vercel-*`
 * members in the checkout are included; directly declared `vercel-*` packages
 * are also supported. All matching members install in a single resolution.
 * Returns an empty list when the override is unset or the project does not
 * depend on a matching package.
 */
export async function getLocalSdkSourcePaths({
  pythonPackage,
  env,
}: {
  pythonPackage: PythonPackage | undefined;
  env: NodeJS.ProcessEnv;
}): Promise<string[]> {
  const sdkRoot = env.VERCEL_SDK_PYTHON;
  if (!sdkRoot) {
    return [];
  }
  const names = await getDeclaredDependencyNames(
    pythonPackage?.manifest?.data?.project?.dependencies
  );
  const hasVercelPackage = [...(names ?? [])].some(
    name => name === 'vercel' || name.startsWith('vercel-')
  );
  if (!hasVercelPackage) {
    return [];
  }

  const entries = await fs.promises.readdir(join(sdkRoot, 'src'), {
    withFileTypes: true,
  });
  return entries
    .filter(
      entry =>
        entry.isDirectory() &&
        (entry.name === 'vercel' || entry.name.startsWith('vercel-')) &&
        (names?.has('vercel') || names?.has(entry.name))
    )
    .map(entry => entry.name)
    .sort()
    .map(name => join(sdkRoot, 'src', name));
}

/**
 * The installed version of each of `distributions` the project will actually
 * run with. Queries the build venv first (accurate even for custom install
 * commands), then fills in whatever it could not answer from the version
 * resolved in uv.lock. Distributions that are neither installed nor locked
 * are absent from the result. Never throws.
 */
export async function getInstalledDistributionVersions<T extends string>({
  uv,
  venvPath,
  projectDir,
  uvLockPath,
  distributions,
}: {
  uv: UvRunner;
  venvPath: string;
  projectDir: string;
  uvLockPath: string | null;
  distributions: readonly T[];
}): Promise<Map<T, string>> {
  const label = distributions.join('/');
  let installed = new Map<T, string>();
  try {
    const result = await uv.run({
      venvPath,
      projectDir,
      args: ['python', '-c', versionQueryScript(distributions)],
    });
    installed = parseVersionQueryOutput(result.stdout, distributions);
  } catch (err) {
    debug(
      `Failed to query installed ${label} version: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const missing = distributions.filter(
    distribution => !installed.has(distribution)
  );
  if (missing.length > 0 && uvLockPath) {
    try {
      const lockContent = await fs.promises.readFile(uvLockPath, 'utf8');
      const lockFile = parseUvLock(lockContent, uvLockPath);
      for (const distribution of missing) {
        const locked = lockFile.packages.find(
          pkg => normalizePackageName(pkg.name) === distribution
        )?.version;
        if (locked && valid(locked)) {
          installed.set(distribution, locked);
        }
      }
    } catch (err) {
      debug(
        `Failed to resolve ${label} version from uv.lock: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return installed;
}

/**
 * The workflow SDK the project will actually run with. The two distributions
 * are alternatives, and the standalone `vercel-workflow` runtime wins over
 * the umbrella `vercel`: when both are installed the umbrella is only a
 * dependent, so the runtime's own version is what describes the serving.
 */
export async function getInstalledWorkflowSdkVersion(opts: {
  uv: UvRunner;
  venvPath: string;
  projectDir: string;
  uvLockPath: string | null;
}): Promise<WorkflowSdkVersion | undefined> {
  return pickInstalledDistribution(
    await getInstalledDistributionVersions({
      ...opts,
      distributions: WORKFLOW_SDK_DISTRIBUTIONS,
    }),
    WORKFLOW_SDK_DISTRIBUTIONS
  );
}

/**
 * Decide how `tool.vercel.workflows` entrypoints are served: through
 * vercel-queue when the project explicitly depends on a workflow SDK that
 * has been ported to it (>= MIN_QUEUE_WORKFLOW_SDK_VERSION for whichever
 * distribution the version came from), and through the legacy vercel-workers
 * integration otherwise — including when the version cannot be determined,
 * since the legacy behavior matches every released SDK.
 */
export async function resolveWorkflowServingMode({
  pythonPackage,
  uv,
  venvPath,
  projectDir,
  uvLockPath,
}: {
  pythonPackage: PythonPackage | undefined;
  uv: UvRunner;
  venvPath: string;
  projectDir: string;
  uvLockPath: string | null;
}): Promise<WorkflowServingMode> {
  if (!(await hasExplicitWorkflowSdkDependency(pythonPackage))) {
    return 'workers';
  }
  const installed = await getInstalledWorkflowSdkVersion({
    uv,
    venvPath,
    projectDir,
    uvLockPath,
  });
  const detected = installed
    ? `${installed.distribution} ${installed.version}`
    : 'workflow SDK (unknown version)';
  if (isQueueWorkflowSdk(installed)) {
    debug(`Detected ${detected}: serving workflows via vercel-queue`);
    return 'queue';
  }
  debug(`Detected ${detected}: serving workflows via vercel-workers`);
  return 'workers';
}

/**
 * Whether an installed workflow SDK serves through vercel-queue, judged
 * against the floor of the distribution the version came from.
 */
export function isQueueWorkflowSdk(
  installed: WorkflowSdkVersion | undefined
): boolean {
  if (!installed) {
    return false;
  }
  try {
    return ge(
      installed.version,
      MIN_QUEUE_WORKFLOW_SDK_VERSION[installed.distribution]
    );
  } catch {
    return false;
  }
}

/**
 * Dev-server variant of the version query: runs the given interpreter
 * directly (the dev venv python), no UvRunner and no uv.lock fallback.
 * Distributions that are not installed are absent from the result. Never
 * throws.
 */
export async function queryPythonDistributionVersions<T extends string>({
  pythonBin,
  cwd,
  env,
  distributions,
}: {
  pythonBin: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  distributions: readonly T[];
}): Promise<Map<T, string>> {
  try {
    const result = await execa(
      pythonBin,
      ['-c', versionQueryScript(distributions)],
      { cwd, env }
    );
    return parseVersionQueryOutput(result.stdout, distributions);
  } catch (err) {
    debug(
      `Failed to query installed ${distributions.join('/')} version: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
  return new Map();
}

/** Dev-server variant of {@link getInstalledWorkflowSdkVersion}. */
export async function queryPythonWorkflowSdkVersion(opts: {
  pythonBin: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}): Promise<WorkflowSdkVersion | undefined> {
  return pickInstalledDistribution(
    await queryPythonDistributionVersions({
      ...opts,
      distributions: WORKFLOW_SDK_DISTRIBUTIONS,
    }),
    WORKFLOW_SDK_DISTRIBUTIONS
  );
}
