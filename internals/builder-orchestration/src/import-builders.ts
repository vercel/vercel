import npa from 'npm-package-arg';
import { satisfies, valid, validRange } from 'semver';
import { dirname, isAbsolute, join, resolve } from 'path';
import { readJSON } from 'fs-extra';
import { isStaticRuntime } from '@vercel/fs-detectors';
import type {
  BuilderV2,
  BuilderV3,
  BuilderVX,
  PackageJson,
  Span,
} from '@vercel/build-utils';
import { isErrnoException } from '@vercel/error-utils';
import type { InstallBuilders } from './install-builders';

export interface BuilderWithPkg {
  /**
   * the absolute path to the entrypoint for this builder (e.g. dist/index.js)
   */
  path: string;
  /**
   * absolute path to the package.json of the builder
   */
  pkgPath: string;
  builder: BuilderV2 | BuilderV3 | BuilderVX;
  pkg: PackageJson & { name: string };
  /**
   * true if the builder was installed into `.vercel/builders` (e.g. via npm);
   * false if resolved from CLI dependencies or built-in (e.g. @vercel/static).
   */
  dynamicallyInstalled: boolean;
}

type ResolveBuildersResult =
  | { buildersToAdd: Set<string>; installReasons: Map<string, string> }
  | { builders: Map<string, BuilderWithPkg> };

function isRemoteBuilderPin(pin: string): boolean {
  return /^https?:\/\//i.test(pin);
}

function isBareSpec(parsed: ReturnType<typeof npa>): boolean {
  return parsed.type === 'tag' && parsed.rawSpec === '';
}

/**
 * Formats resolved Builders as `name@version=<dir>` pairs for trace
 * attributes, so we can tell which installation each Builder loaded from.
 */
export function formatResolvedBuilders(
  builders: Map<string, BuilderWithPkg>
): string {
  return Array.from(builders.values(), b =>
    b.pkgPath
      ? `${b.pkg.name}@${b.pkg.version}=${dirname(b.pkgPath)}`
      : `${b.pkg.name}=built-in`
  ).join(',');
}

function pinBuilderSpecs(
  specs: Set<string>,
  pins: ReadonlyMap<string, string>
): Map<string, string> {
  const pinnedSpecs = new Map<string, string>();
  for (const spec of specs) {
    const parsed = npa(spec);
    if (parsed.name && isBareSpec(parsed)) {
      const version = pins.get(parsed.name);
      if (version) {
        // Remote pins install as the URL; version pins as name@version.
        pinnedSpecs.set(
          spec,
          isRemoteBuilderPin(version) ? version : `${parsed.name}@${version}`
        );
      }
    }
  }
  return pinnedSpecs;
}

/**
 * Directory that Builders are installed into and resolved from.
 * Defaults to `.vercel/builders` within the project, and may be
 * overridden with `VERCEL_BUILDERS_DIR` (relative paths resolve
 * against `cwd`). Eventually this will default to a shared cache
 * location (e.g. under the global `.vercel` or XDG cache dir).
 */
export function getBuildersDir(cwd: string, vercelDir = '.vercel'): string {
  const override = process.env.VERCEL_BUILDERS_DIR;
  if (override) {
    return isAbsolute(override) ? override : resolve(cwd, override);
  }
  return join(cwd, vercelDir, 'builders');
}

interface StaticBuilder extends BuilderV2 {
  version: 2;
}

export interface ImportBuildersDependencies {
  builderPins: Readonly<Record<string, string>>;
  debug(message: string): void;
  installBuilders: InstallBuilders;
  isNativeBinaryInstall(): boolean;
  require: NodeRequire;
  staticBuilder: StaticBuilder;
  vercelDir?: string;
}

/**
 * Imports the specified Vercel Builders, installing any missing ones
 * into the Builders directory (see {@link getBuildersDir}) if necessary.
 */
export function createImportBuilders(dependencies: ImportBuildersDependencies) {
  const {
    debug,
    installBuilders,
    isNativeBinaryInstall,
    require,
    staticBuilder,
    vercelDir,
  } = dependencies;
  const builderPins = new Map<string, string>();
  for (const [name, version] of Object.entries(dependencies.builderPins)) {
    if (validRange(version) || isRemoteBuilderPin(version)) {
      builderPins.set(name, version);
    }
  }
  const resolveDependencies = {
    builderPins,
    debug,
    isNativeBinaryInstall,
    require,
    staticBuilder,
  };

  return async function importBuilders(
    builderSpecs: Set<string>,
    cwd: string,
    span?: Span
  ): Promise<Map<string, BuilderWithPkg>> {
    const buildersDir = getBuildersDir(cwd, vercelDir);

    let importResult = await resolveBuilders(
      buildersDir,
      builderSpecs,
      resolveDependencies
    );

    if ('buildersToAdd' in importResult) {
      const { buildersToAdd, installReasons } = importResult;
      const pinnedSpecs = pinBuilderSpecs(buildersToAdd, builderPins);
      const installResult = await installBuilders(
        buildersDir,
        new Set(
          Array.from(buildersToAdd, spec => pinnedSpecs.get(spec) ?? spec)
        ),
        span,
        installReasons,
        pinnedSpecs
      );

      const allowedPinDriftSpecs = new Set(
        Array.from(pinnedSpecs.keys()).filter(spec => installResult.has(spec))
      );
      importResult = await resolveBuilders(
        buildersDir,
        builderSpecs,
        resolveDependencies,
        installResult,
        allowedPinDriftSpecs
      );

      if ('buildersToAdd' in importResult) {
        const { buildersToAdd: failed, installReasons: reasons } = importResult;
        const failures = Array.from(failed, spec => {
          const reason = reasons.get(spec);
          return reason ? `${spec} (${reason})` : spec;
        });
        const err = new Error(
          `Failed to load Builders after installing them: ${failures.join(
            ', '
          )}. Retry the build. If the failure persists, contact Vercel Support.`
        );
        Object.assign(err, {
          link: 'https://vercel.link/builder-dependencies-install-failed',
        });
        throw err;
      }
    }

    // Figure out what
    const resolvedBuildersDebug = [];
    for (const [spec, builderSpec] of importResult.builders) {
      resolvedBuildersDebug.push(`${spec} => ${builderSpec.pkg.version}`);
    }

    debug(`Resolved builders: "${resolvedBuildersDebug.join(', ')}"`);
    return importResult.builders;
  };
}

/**
 * Extracts the module ID from a `MODULE_NOT_FOUND` error message when it is
 * a package-style ID (not a filesystem path), for use in trace attributes.
 */
function missingModuleId(err: Error): string | undefined {
  const match = /Cannot find module '([^']+)'/.exec(err.message);
  const id = match?.[1];
  if (!id) {
    return undefined;
  }
  if (id.startsWith('/') || id.startsWith('.') || /^[A-Za-z]:[\\/]/.test(id)) {
    return undefined;
  }
  return id.replace(/[,=]/g, '_').slice(0, 100);
}

async function resolveBuilders(
  buildersDir: string,
  builderSpecs: Set<string>,
  dependencies: Pick<
    ImportBuildersDependencies,
    'debug' | 'isNativeBinaryInstall' | 'require' | 'staticBuilder'
  > & { builderPins: ReadonlyMap<string, string> },
  resolvedSpecs?: Map<string, string>,
  allowedPinDriftSpecs?: Set<string>
): Promise<ResolveBuildersResult> {
  const builders = new Map<string, BuilderWithPkg>();
  const buildersToAdd = new Set<string>();
  const installReasons = new Map<string, string>();

  for (const spec of builderSpecs) {
    const resolvedSpec = resolvedSpecs?.get(spec) || spec;
    const parsed = npa(resolvedSpec);

    const { name } = parsed;
    if (!name) {
      // A URL was specified - will need to install it and resolve the
      // proper package name from the written `package.json` file
      buildersToAdd.add(spec);
      installReasons.set(spec, 'url-spec');
      continue;
    }

    if (isStaticRuntime(name)) {
      // `@vercel/static` is a special-case built-in builder
      builders.set(name, {
        builder: dependencies.staticBuilder,
        pkg: { name },
        path: '',
        pkgPath: '',
        dynamicallyInstalled: false,
      });
      continue;
    }

    let entrypointLoadFailed = false;
    try {
      let pkgPath: string | undefined;
      let builderPkg: PackageJson | undefined;

      try {
        // First try the Builders directory. The package name should always be
        // available at the top-level of `node_modules` since CLI is installing
        // those directly.
        pkgPath = join(buildersDir, 'node_modules', name, 'package.json');
        builderPkg = await readJSON(pkgPath);
      } catch (error: unknown) {
        if (!isErrnoException(error)) {
          throw error;
        }
        if (error.code !== 'ENOENT') {
          throw error;
        }

        // Builders are not staged into the native binary snapshot. When one
        // is missing from the Builders directory, install the CLI-pinned spec
        // instead of falling back to the CLI's local dependencies.
        if (dependencies.isNativeBinaryInstall()) {
          buildersToAdd.add(spec);
          installReasons.set(spec, 'not-installed');
          continue;
        }

        // If `pkgPath` wasn't found in the Builders directory then try as a
        // CLI local dependency. `require.resolve()` will throw if the Builder
        // is not a CLI dep, in which case we'll install it.
        pkgPath = dependencies.require.resolve(`${name}/package.json`);
        builderPkg = await readJSON(pkgPath);
      }

      if (!builderPkg || !pkgPath) {
        throw new Error(`Failed to load \`package.json\` for "${name}"`);
      }

      if (typeof builderPkg.version !== 'string') {
        throw new Error(
          `\`package.json\` for "${name}" does not contain a "version" field`
        );
      }

      const peerVersion = dependencies.builderPins.get(name);
      // Only exact-version pins enforce equality. Remote (tarball URL) pins
      // are install targets only — the resolved package version cannot equal
      // a URL. Range-shaped pins (never produced by pin-builders, which
      // requires exact versions) must not force a reinstall on every run.
      if (
        isBareSpec(parsed) &&
        peerVersion &&
        valid(peerVersion) &&
        builderPkg.version !== peerVersion &&
        !allowedPinDriftSpecs?.has(spec)
      ) {
        dependencies.debug(
          `Resolved "${name}@${builderPkg.version}" does not match pin "${peerVersion}"`
        );
        buildersToAdd.add(spec);
        installReasons.set(spec, 'pin-version-mismatch');
        continue;
      }

      // URL pins cannot be compared to package.json#version. npm records the
      // requested URL in the Builders directory's package.json, so compare the
      // source instead. This catches npm installs and different preview packs,
      // including native PR binaries whose CLI version has no preview suffix.
      if (
        isBareSpec(parsed) &&
        peerVersion &&
        isRemoteBuilderPin(peerVersion) &&
        pkgPath.startsWith(buildersDir) &&
        !allowedPinDriftSpecs?.has(spec)
      ) {
        let installedSpec: string | undefined;
        try {
          const buildersPkg = await readJSON(join(buildersDir, 'package.json'));
          installedSpec = buildersPkg.dependencies?.[name];
        } catch (error: unknown) {
          if (!isErrnoException(error) || error.code !== 'ENOENT') {
            throw error;
          }
        }
        if (installedSpec !== peerVersion) {
          dependencies.debug(
            `Installed source for "${name}@${builderPkg.version}" is "${installedSpec ?? 'unknown'}", not pin "${peerVersion}"`
          );
          // Native has no CLI-bundled builders, so reinstall the pin.
          // Non-native: the CLI tarball already depends on these builders.
          // Try that copy before npm-installing the same tarball into
          // `.vercel/builders` (which is how a failed CLI install plus
          // build cache keeps forcing `Installing Builder:`).
          if (dependencies.isNativeBinaryInstall()) {
            buildersToAdd.add(spec);
            installReasons.set(spec, 'preview-pack-mismatch');
            continue;
          }
          try {
            pkgPath = dependencies.require.resolve(`${name}/package.json`);
            builderPkg = await readJSON(pkgPath);
          } catch (resolveError: unknown) {
            if (
              isErrnoException(resolveError) &&
              (resolveError.code === 'MODULE_NOT_FOUND' ||
                resolveError.code === 'ENOENT')
            ) {
              buildersToAdd.add(spec);
              installReasons.set(spec, 'preview-pack-mismatch');
              continue;
            }
            throw resolveError;
          }
        }
      }

      if (!builderPkg || !pkgPath) {
        throw new Error(`Failed to load \`package.json\` for "${name}"`);
      }

      if (typeof builderPkg.version !== 'string') {
        throw new Error(
          `\`package.json\` for "${name}" does not contain a "version" field`
        );
      }

      if (parsed.type === 'version' && parsed.rawSpec !== builderPkg.version) {
        // An explicit Builder version was specified but it does
        // not match the version that is currently installed
        dependencies.debug(
          `Installed version "${name}@${builderPkg.version}" does not match "${parsed.rawSpec}"`
        );
        buildersToAdd.add(spec);
        installReasons.set(spec, 'version-mismatch');
        continue;
      }

      if (
        parsed.type === 'range' &&
        !satisfies(builderPkg.version, parsed.rawSpec)
      ) {
        // An explicit Builder range was specified but it is not
        // compatible with the version that is currently installed
        dependencies.debug(
          `Installed version "${name}@${builderPkg.version}" is not compatible with "${parsed.rawSpec}"`
        );
        buildersToAdd.add(spec);
        installReasons.set(spec, 'range-mismatch');
        continue;
      }

      // TODO: handle `parsed.type === 'tag'` ("latest" vs. anything else?)
      const path = join(dirname(pkgPath), builderPkg.main || 'index.js');

      let builder;
      try {
        builder = dependencies.require(path);
      } catch (requireErr: unknown) {
        // The Builder's `package.json` was found but loading its entrypoint
        // failed — track separately from "not installed" so traces can tell
        // a broken installation apart from a missing one.
        entrypointLoadFailed = true;
        throw requireErr;
      }

      const dynamicallyInstalled = pkgPath.startsWith(buildersDir);

      builders.set(spec, {
        builder,
        pkg: {
          name,
          ...builderPkg,
        },
        path,
        pkgPath,
        dynamicallyInstalled,
      });
      dependencies.debug(
        `Imported Builder "${name}" from "${dirname(pkgPath)}"`
      );
    } catch (error: unknown) {
      if (!(error instanceof Error)) {
        throw error;
      }
      const err = error as Error & { code?: string; link?: string };
      // On the 2nd pass (`resolvedSpecs` set), don't retry install — surface
      // the error. Treat ENOENT like MODULE_NOT_FOUND for native SEA VFS
      // ghost paths that would otherwise skip the install fallback.
      if (
        (err.code === 'MODULE_NOT_FOUND' || err.code === 'ENOENT') &&
        !resolvedSpecs
      ) {
        dependencies.debug(`Failed to import "${name}": ${err}`);
        buildersToAdd.add(spec);
        if (entrypointLoadFailed) {
          const missing = missingModuleId(err);
          installReasons.set(
            spec,
            missing
              ? `entrypoint-load-failed:${missing}`
              : 'entrypoint-load-failed'
          );
        } else {
          installReasons.set(spec, 'not-installed');
        }
      } else {
        err.message = `Importing "${name}": ${err.message}`;
        throw err;
      }
    }
  }

  // Add any Builders that are not yet present into `.vercel/builders`
  if (buildersToAdd.size > 0) {
    return { buildersToAdd, installReasons };
  }

  return { builders };
}
