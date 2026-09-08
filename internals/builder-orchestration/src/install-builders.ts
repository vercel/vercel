import { URL } from 'url';
import plural from 'pluralize';
import { join } from 'path';
import npa from 'npm-package-arg';
import { validRange } from 'semver';
import { mkdirp, outputJSON, symlink } from 'fs-extra';
import type { PackageJson, Span } from '@vercel/build-utils';
import { isErrnoException, isError } from '@vercel/error-utils';
import type { Writable } from 'stream';

export interface InstallBuildersOutput {
  debug(message: string): void;
  log(message: string): void;
  warn(message: string): void;
}

export interface InstallBuildersDependencies {
  buildUtilsVersion?: string;
  code(value: string): string;
  cmd(value: string): string;
  isCantParseJSONFile(value: unknown): value is Error;
  output: InstallBuildersOutput;
  readJSONFile<T>(path: string): Promise<T | Error | null>;
  run(
    command: string,
    args: string[],
    options: { cwd: string; stdio: 'pipe'; reject: true }
  ): Promise<{ stderr: string }>;
}

type BonusError = Error & {
  stderr?: string | Writable;
};

export function getBuildUtilsSpec(buildUtilsVersion?: string): string {
  if (!buildUtilsVersion) return '@vercel/build-utils';
  if (validRange(buildUtilsVersion)) {
    return `@vercel/build-utils@${buildUtilsVersion}`;
  }

  try {
    if (npa(buildUtilsVersion).type === 'remote') {
      return `@vercel/build-utils@${buildUtilsVersion}`;
    }
  } catch {
    // Fall through to the published package for unsupported dependency specs.
  }

  return '@vercel/build-utils';
}

function getErrorMessage(err: BonusError, execaMessage: string) {
  if (!err || !('stderr' in err)) {
    return execaMessage;
  }

  if (typeof err.stderr === 'string') {
    return err.stderr;
  }

  return execaMessage;
}

async function untracedInstallBuilders(
  buildersDir: string,
  buildersToAdd: Set<string>,
  dependencies: InstallBuildersDependencies
): Promise<Map<string, string>> {
  const { buildUtilsVersion, code, cmd, output, readJSONFile, run } =
    dependencies;
  const resolvedSpecs = new Map<string, string>();
  const buildersPkgPath = join(buildersDir, 'package.json');
  try {
    const emptyPkgJson = {
      private: true,
      license: 'UNLICENSED',
    };
    await outputJSON(buildersPkgPath, emptyPkgJson, {
      flag: 'wx',
    });
  } catch (error: unknown) {
    if (!isErrnoException(error) || error.code !== 'EEXIST') throw error;
  }

  output.log(
    `Installing ${plural('Builder', buildersToAdd.size)}: ${Array.from(
      buildersToAdd
    ).join(', ')}`
  );
  const buildUtilsSpec = getBuildUtilsSpec(buildUtilsVersion);

  const installArgs = ['install', buildUtilsSpec, ...buildersToAdd];

  try {
    const { stderr } = await run('npm', installArgs, {
      cwd: buildersDir,
      stdio: 'pipe',
      reject: true,
    });
    stderr
      .split('/\r?\n/')
      .filter(line => line.includes('npm WARN deprecated'))
      .forEach(line => {
        output.warn(line);
      });
  } catch (err: unknown) {
    if (isError(err)) {
      const execaMessage = err.message;
      let message = getErrorMessage(err, execaMessage);
      if (execaMessage.startsWith('Command failed with ENOENT')) {
        // `npm` is not installed
        message = `Please install ${cmd('npm')} before continuing`;
      } else {
        const notFound = /GET (.*) - Not found/.exec(message);
        const notFoundUrl = notFound?.[1];
        if (notFoundUrl) {
          const url = new URL(notFoundUrl);
          const packagePath = decodeURIComponent(url.pathname);
          const packageName =
            /(@[^/]+\/[^/]+)$/.exec(packagePath)?.[1] ??
            packagePath.split('/').filter(Boolean).at(-1) ??
            packagePath;
          message = `The package ${code(
            packageName
          )} is not published on the npm registry`;
        }
      }
      err.message = message;
      Object.assign(err, {
        link: 'https://vercel.link/builder-dependencies-install-failed',
      });
    }
    throw err;
  }

  // Symlink `@now/build-utils` -> `@vercel/build-utils` to support legacy Builders
  const nowScopePath = join(buildersDir, 'node_modules/@now');
  await mkdirp(nowScopePath);

  try {
    await symlink('../@vercel/build-utils', join(nowScopePath, 'build-utils'));
  } catch (err: unknown) {
    if (!isErrnoException(err) || err.code !== 'EEXIST') {
      // Throw unless the error is due to the symlink already existing
      throw err;
    }
  }

  // Cross-reference any builderSpecs from the saved `package.json` file,
  // in case they were installed from a URL
  const buildersPkg = await readJSONFile<PackageJson>(buildersPkgPath);
  if (dependencies.isCantParseJSONFile(buildersPkg)) throw buildersPkg;
  if (!buildersPkg) {
    throw new Error(`Failed to load "${buildersPkgPath}"`);
  }
  for (const spec of buildersToAdd) {
    for (const [name, version] of Object.entries(
      buildersPkg.dependencies || {}
    )) {
      if (version === spec) {
        output.debug(`Resolved Builder spec "${spec}" to name "${name}"`);
        resolvedSpecs.set(spec, name);
      }
    }
  }

  return resolvedSpecs;
}

export type InstallBuilders = (
  buildersDir: string,
  buildersToAdd: Set<string>,
  span?: Span,
  installReasons?: Map<string, string>,
  /**
   * Bare specs rewritten to `name@pin` from `package.json#builders`.
   * When present, the install span is tagged so we can track dynamic installs
   * of builders we intend to preinstall.
   */
  pinnedSpecs?: Map<string, string>
) => Promise<Map<string, string>>;

export function createInstallBuilders(
  dependencies: InstallBuildersDependencies
): InstallBuilders {
  const { output } = dependencies;
  return async function installBuilders(
    buildersDir,
    buildersToAdd,
    span,
    installReasons,
    pinnedSpecs
  ) {
    const install = async () => {
      try {
        return await untracedInstallBuilders(
          buildersDir,
          buildersToAdd,
          dependencies
        );
      } catch (err) {
        if (!pinnedSpecs?.size) {
          throw err;
        }

        const fallbackSpecs = new Set(
          Array.from(buildersToAdd, spec => {
            for (const [originalSpec, pinnedSpec] of pinnedSpecs) {
              if (pinnedSpec === spec) {
                return originalSpec;
              }
            }
            return spec;
          })
        );
        output.warn(
          'Could not install the Builder versions pinned by this Vercel CLI release. Retrying with versions allowed by your npm settings.'
        );
        const resolvedSpecs = await untracedInstallBuilders(
          buildersDir,
          fallbackSpecs,
          dependencies
        );
        for (const originalSpec of pinnedSpecs.keys()) {
          if (fallbackSpecs.has(originalSpec)) {
            resolvedSpecs.set(originalSpec, originalSpec);
          }
        }
        return resolvedSpecs;
      }
    };

    if (!span) {
      return install();
    }
    const attributes: Record<string, string> = {
      packages: Array.from(buildersToAdd).join(','),
    };
    if (installReasons && installReasons.size > 0) {
      attributes.reasons = Array.from(installReasons)
        .map(([spec, reason]) => `${spec}=${reason}`)
        .join(',');
    }
    if (pinnedSpecs && pinnedSpecs.size > 0) {
      attributes.pinned = 'true';
      attributes.pinnedPackages = Array.from(pinnedSpecs.values()).join(',');
    }
    const installSpan = span.child('vc.installBuilders', attributes);
    return installSpan.trace(async s => {
      try {
        return await install();
      } catch (err) {
        s.setAttributes({
          error: isError(err) ? err.message : String(err),
        });
        throw err;
      }
    });
  };
}
