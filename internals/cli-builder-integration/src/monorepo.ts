import { relative, basename, isAbsolute, join, resolve, sep } from 'path';
import {
  LocalFileSystemDetector,
  getMonorepoDefaultSettings,
  MissingBuildPipeline,
  MissingBuildTarget,
} from '@vercel/fs-detectors';
import { inferRuntime } from '@vercel-internals/runtimes/runtime';
import title from 'title';
import fs from 'fs-extra';
import {
  debug,
  normalizePath,
  type PackageJson,
  type Services,
} from '@vercel/build-utils';

interface MonorepoOutput {
  log(message: string): void;
  warn(message: string): void;
}

interface MonorepoProjectSettings {
  buildCommand?: string | null;
  installCommand?: string | null;
  commandForIgnoringBuildStep?: string | null;
  monorepoManager?: string;
}

export async function setMonorepoDefaultSettings(
  cwd: string,
  workPath: string,
  projectSettings: MonorepoProjectSettings,
  output: MonorepoOutput
) {
  const localFileSystem = new LocalFileSystemDetector(cwd);

  const projectName = basename(workPath);
  const relativeToRoot = relative(workPath, cwd);

  const setCommand = (
    command: 'buildCommand' | 'installCommand' | 'commandForIgnoringBuildStep',
    value: string
  ) => {
    if (projectSettings[command]) {
      debug(
        `Skipping auto-assignment of ${command} as it is already set via project settings or configuration overrides.`
      );
    } else {
      projectSettings[command] = value;
    }
  };

  try {
    const result = await getMonorepoDefaultSettings(
      projectName,
      relative(cwd, workPath),
      relativeToRoot,
      localFileSystem
    );

    if (result === null) {
      return;
    }

    projectSettings.monorepoManager = result.monorepoManager;

    const { monorepoManager, ...commands } = result;

    output.log(
      `Detected ${title(monorepoManager)}. Adjusting default settings...`
    );

    if (commands.buildCommand) {
      setCommand('buildCommand', commands.buildCommand);
    }
    if (commands.installCommand) {
      setCommand('installCommand', commands.installCommand);
    }
    if (commands.commandForIgnoringBuildStep) {
      setCommand(
        'commandForIgnoringBuildStep',
        commands.commandForIgnoringBuildStep
      );
    }
  } catch (error) {
    if (
      error instanceof MissingBuildPipeline ||
      error instanceof MissingBuildTarget
    ) {
      output.warn(`${error.message} Skipping automatic setting assignment.`);
      return;
    }

    throw error;
  }
}

/**
 * Returns `true` when the service root defines its own `vercel-build` script.
 *
 * This mirrors the project-level escape hatch applied in `vc build` (a
 * `vercel-build` script in the Root Directory disables monorepo defaults), but
 * re-scoped to the service root, which is the directory the builder actually
 * runs in.
 */
async function hasVercelBuildScript(serviceRoot: string): Promise<boolean> {
  try {
    const pkg: PackageJson = await fs.readJSON(
      join(serviceRoot, 'package.json')
    );
    return pkg?.scripts?.['vercel-build'] !== undefined;
  } catch {
    // A missing or unparseable package.json declares no escape hatch.
    return false;
  }
}

/**
 * Fills in a monorepo-aware default `buildCommand` for every service that does
 * not declare one of its own.
 *
 * Services take a separate build path from ordinary projects: `detectBuilders()`
 * short-circuits to the services resolver, and each service's `buildCommand` is
 * used verbatim, so `setMonorepoDefaultSettings()` above never applies to them.
 * Without this, a service in a Turborepo/Nx workspace falls through to the leaf
 * `package.json` `build` script and loses the task graph and build cache.
 *
 * This must run *before* `detectBuilders()`, because the services resolver picks
 * `@vercel/static-build` vs. `@vercel/static` based on whether a `buildCommand`
 * is present. Injecting the default afterwards would hand the command to a
 * builder that ignores it.
 *
 * Returns a copy with the defaults applied, or the original object when nothing
 * changed, so the caller's `vercel.json` echo stays pristine.
 */
export async function applyServicesMonorepoDefaults(
  cwd: string,
  workPath: string,
  services: Services,
  projectSettings: MonorepoProjectSettings,
  output: MonorepoOutput
): Promise<Services> {
  const localFileSystem = new LocalFileSystemDetector(cwd);
  let result: Services | undefined;
  let announced = false;

  for (const [name, config] of Object.entries(services)) {
    if (config.buildCommand) {
      debug(
        `Skipping auto-assignment of buildCommand for service "${name}" as it is already set in the services configuration.`
      );
      continue;
    }

    // Monorepo managers orchestrate JavaScript-ecosystem tasks, so their default
    // command is only meaningful for services that build through one. A Python,
    // Go, Rust, Ruby or container service is not a package in the task graph,
    // and `@vercel/python` / `@vercel/go` would execute the command verbatim and
    // fail. Leave those on their runtime's own build behaviour.
    const runtime = inferRuntime({
      runtime: config.runtime,
      framework: config.framework,
      entrypoint: config.entrypoint,
    });
    if (runtime !== undefined && runtime !== 'node') {
      debug(
        `Skipping monorepo defaults for service "${name}": runtime "${runtime}" does not build via the monorepo task graph.`
      );
      continue;
    }

    const serviceRoot = resolve(workPath, config.root ?? '.');
    const projectPath = relative(cwd, serviceRoot);

    // A service root outside the repository root has no place in the monorepo
    // task graph, so there is no sensible default to derive.
    if (
      isAbsolute(projectPath) ||
      projectPath === '..' ||
      projectPath.startsWith(`..${sep}`)
    ) {
      debug(
        `Skipping monorepo defaults for service "${name}": root "${config.root}" is outside "${cwd}".`
      );
      continue;
    }

    if (await hasVercelBuildScript(serviceRoot)) {
      debug(
        `Skipping monorepo defaults for service "${name}": a \`vercel-build\` script is defined in its root package.json.`
      );
      continue;
    }

    // `getMonorepoDefaultSettings()` interpolates these into shell commands —
    // notably a Turborepo `--filter={<path>}...` glob, where a Windows `\` would
    // be parsed as an escape character rather than a separator. Normalize to
    // POSIX so the generated command is correct on every platform, matching how
    // these arguments are constructed elsewhere.
    const posixProjectPath = normalizePath(projectPath);
    const posixRelativeToRoot = normalizePath(relative(serviceRoot, cwd));

    let settings;
    try {
      settings = await getMonorepoDefaultSettings(
        basename(serviceRoot),
        // `getMonorepoDefaultSettings()` expects `/` (not `''`) to mean "the
        // monorepo root", which is a valid service root.
        posixProjectPath || '/',
        posixRelativeToRoot,
        localFileSystem
      );
    } catch (error) {
      // Turborepo resolves the `build` pipeline from the root `turbo.json` /
      // root `package.json` only, so this verdict is repo-wide: no service can
      // get a default. Warn once and stop.
      if (error instanceof MissingBuildPipeline) {
        output.warn(`${error.message} Skipping automatic setting assignment.`);
        break;
      }

      // Nx resolves the `build` target per project: `nx.json` declares no
      // `targetDefaults.build` and *this* service's own `project.json` /
      // `package.json` declares no build target either. Sibling services may
      // still be configured correctly, so keep going and name the offender.
      if (error instanceof MissingBuildTarget) {
        output.warn(
          `Service "${name}": ${error.message} Skipping automatic setting assignment.`
        );
        continue;
      }

      throw error;
    }

    // No monorepo manager detected. The answer is the same for every service.
    if (settings === null) {
      break;
    }

    projectSettings.monorepoManager = settings.monorepoManager;

    if (!settings.buildCommand) {
      continue;
    }

    if (!announced) {
      output.log(
        `Detected ${title(settings.monorepoManager)}. Adjusting default settings...`
      );
      announced = true;
    }

    debug(
      `Assigning buildCommand "${settings.buildCommand}" to service "${name}".`
    );

    result ??= { ...services };
    result[name] = { ...config, buildCommand: settings.buildCommand };
  }

  return result ?? services;
}
