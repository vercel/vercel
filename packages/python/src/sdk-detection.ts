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
 * The first release of the `vercel` Python SDK whose `vercel.workflow`
 * subsystem runs on `vercel-queue` instead of `vercel-workers`. Older
 * releases (and projects where the version cannot be determined) must be
 * served through the legacy vercel-workers integration.
 */
export const MIN_QUEUE_WORKFLOW_SDK_VERSION = '0.8.0';

/**
 * How workflow (and worker) entrypoints are served at runtime:
 * - 'queue': via `vercel.queue.asgi_app()` with introspected subscriptions.
 * - 'workers': via the legacy vercel-workers bootstrap keyed on
 *   VERCEL_SERVICE_TYPE / VERCEL_HAS_WORKER_SERVICES.
 */
export type WorkflowServingMode = 'queue' | 'workers';

const VERSION_QUERY_SCRIPT =
  'import importlib.metadata, sys; ' +
  'sys.stdout.write(importlib.metadata.version("vercel"))';

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
 * Whether the project declares an explicit dependency on the `vercel`
 * Python SDK (the package that provides `vercel.workflow`).
 */
export async function hasExplicitVercelSdkDependency(
  pythonPackage: PythonPackage | undefined
): Promise<boolean> {
  const names = await getDeclaredDependencyNames(
    pythonPackage?.manifest?.data?.project?.dependencies
  );
  return names?.has('vercel') ?? false;
}

/**
 * Resolve the `vercel` SDK version the project will actually run with.
 * Queries the build venv first (accurate even for custom install commands),
 * then falls back to the resolved version recorded in uv.lock. Returns
 * undefined when the version cannot be determined; never throws.
 */
export async function getInstalledVercelSdkVersion({
  uv,
  venvPath,
  projectDir,
  uvLockPath,
}: {
  uv: UvRunner;
  venvPath: string;
  projectDir: string;
  uvLockPath: string | null;
}): Promise<string | undefined> {
  try {
    const result = await uv.run({
      venvPath,
      projectDir,
      args: ['python', '-c', VERSION_QUERY_SCRIPT],
    });
    const version = result.stdout.trim();
    if (valid(version)) {
      return version;
    }
  } catch (err) {
    debug(
      `Failed to query installed vercel SDK version: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  if (uvLockPath) {
    try {
      const lockContent = await fs.promises.readFile(uvLockPath, 'utf8');
      const lockFile = parseUvLock(lockContent, uvLockPath);
      const locked = lockFile.packages.find(
        pkg => normalizePackageName(pkg.name) === 'vercel'
      )?.version;
      if (locked && valid(locked)) {
        return locked;
      }
    } catch (err) {
      debug(
        `Failed to resolve vercel SDK version from uv.lock: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return undefined;
}

/**
 * Decide how `tool.vercel.workflows` entrypoints are served: through
 * vercel-queue when the project explicitly depends on a `vercel` SDK that
 * has been ported to it (>= MIN_QUEUE_WORKFLOW_SDK_VERSION), and through
 * the legacy vercel-workers integration otherwise — including when the
 * version cannot be determined, since the legacy behavior matches every
 * released SDK.
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
  if (!(await hasExplicitVercelSdkDependency(pythonPackage))) {
    return 'workers';
  }
  const version = await getInstalledVercelSdkVersion({
    uv,
    venvPath,
    projectDir,
    uvLockPath,
  });
  if (version && isQueueWorkflowSdkVersion(version)) {
    debug(`Detected vercel SDK ${version}: serving workflows via vercel-queue`);
    return 'queue';
  }
  debug(
    `Detected vercel SDK ${version ?? '(unknown version)'}: serving workflows via vercel-workers`
  );
  return 'workers';
}

export function isQueueWorkflowSdkVersion(version: string): boolean {
  try {
    return ge(version, MIN_QUEUE_WORKFLOW_SDK_VERSION);
  } catch {
    return false;
  }
}

/**
 * Dev-server variant of the version query: runs the given interpreter
 * directly (the dev venv python), no UvRunner involved. Returns undefined
 * when the version cannot be determined; never throws.
 */
export async function queryPythonVercelSdkVersion({
  pythonBin,
  cwd,
  env,
}: {
  pythonBin: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}): Promise<string | undefined> {
  try {
    const result = await execa(pythonBin, ['-c', VERSION_QUERY_SCRIPT], {
      cwd,
      env,
    });
    const version = result.stdout.trim();
    if (valid(version)) {
      return version;
    }
  } catch (err) {
    debug(
      `Failed to query installed vercel SDK version: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
  return undefined;
}
