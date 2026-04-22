import npa from 'npm-package-arg';
import { satisfies } from 'semver';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import { readJSON } from 'fs-extra';
import { isStaticRuntime } from '@vercel/fs-detectors';
import type {
  BuilderV2,
  BuilderV3,
  BuilderVX,
  PackageJson,
  Span,
} from '@vercel/build-utils';
import * as staticBuilder from './static-builder';
import { VERCEL_DIR } from '../projects/link';
import { isErrnoException } from '@vercel/error-utils';
import output from '../../output-manager';
import { installBuilders } from './install-builders';

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
  | { buildersToAdd: Set<string> }
  | { builders: Map<string, BuilderWithPkg> };

// Get a real `require()` reference that esbuild won't mutate
const require_ = createRequire(__filename);

// Builders bundled into the CLI itself. The compiled-binary distribution
// cannot resolve modules from disk, so bundled copies are preferred.
// Only include builders whose `dist/` is present at build time.
const BUILTIN_BUILDERS: Record<string, () => Promise<unknown>> = {
  '@vercel/go': () => import('@vercel/go'),
  '@vercel/hydrogen': () => import('@vercel/hydrogen'),
  '@vercel/next': () => import('@vercel/next'),
  '@vercel/node': () => import('@vercel/node'),
  '@vercel/python': () => import('@vercel/python'),
  '@vercel/redwood': () => import('@vercel/redwood'),
  '@vercel/remix-builder': () => import('@vercel/remix-builder'),
  '@vercel/ruby': () => import('@vercel/ruby'),
  '@vercel/rust': () => import('@vercel/rust'),
  '@vercel/static-build': () => import('@vercel/static-build'),
};

function getBuiltinBuilderVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require_('../../package.json') as { version: string }).version;
  } catch {
    return '0.0.0';
  }
}

function unwrapEsmDefault(mod: unknown): BuilderV2 | BuilderV3 | BuilderVX {
  // ESM/CJS interop: builder entry points may live on the namespace or on
  // `.default` depending on loader. Prefer whichever has `build`.
  const hasBuild = (v: unknown): boolean =>
    !!v &&
    typeof v === 'object' &&
    typeof (v as Record<string, unknown>).build === 'function';

  const m = mod as Record<string, unknown>;
  if (hasBuild(m)) {
    return m as unknown as BuilderV2 | BuilderV3 | BuilderVX;
  }
  if (m && typeof m === 'object' && hasBuild(m.default)) {
    return m.default as unknown as BuilderV2 | BuilderV3 | BuilderVX;
  }
  return m as unknown as BuilderV2 | BuilderV3 | BuilderVX;
}

/**
 * Imports the specified Vercel Builders, installing any missing ones
 * into `.vercel/builders` if necessary.
 */
export async function importBuilders(
  builderSpecs: Set<string>,
  cwd: string,
  span?: Span
): Promise<Map<string, BuilderWithPkg>> {
  const buildersDir = join(cwd, VERCEL_DIR, 'builders');

  let importResult = await resolveBuilders(buildersDir, builderSpecs);

  if ('buildersToAdd' in importResult) {
    const { buildersToAdd } = importResult;
    const installResult = await installBuilders(
      buildersDir,
      buildersToAdd,
      span
    );

    importResult = await resolveBuilders(
      buildersDir,
      builderSpecs,
      installResult
    );

    if ('buildersToAdd' in importResult) {
      throw new Error('Something went wrong!');
    }
  }

  // Figure out what
  const resolvedBuildersDebug = [];
  for (const [spec, builderSpec] of importResult.builders) {
    resolvedBuildersDebug.push(`${spec} => ${builderSpec.pkg.version}`);
  }

  output.debug(`Resolved builders: "${resolvedBuildersDebug.join(', ')}"`);
  return importResult.builders;
}

async function resolveBuilders(
  buildersDir: string,
  builderSpecs: Set<string>,
  resolvedSpecs?: Map<string, string>
): Promise<ResolveBuildersResult> {
  const builders = new Map<string, BuilderWithPkg>();
  const buildersToAdd = new Set<string>();

  for (const spec of builderSpecs) {
    const resolvedSpec = resolvedSpecs?.get(spec) || spec;
    const parsed = npa(resolvedSpec);

    const { name } = parsed;
    if (!name) {
      // A URL was specified - will need to install it and resolve the
      // proper package name from the written `package.json` file
      buildersToAdd.add(spec);
      continue;
    }

    if (isStaticRuntime(name)) {
      // `@vercel/static` is a special-case built-in builder
      builders.set(name, {
        builder: staticBuilder,
        pkg: { name },
        path: '',
        pkgPath: '',
        dynamicallyInstalled: false,
      });
      continue;
    }

    // Check if this builder is bundled into the CLI itself. If the user's
    // version constraint is satisfied by the bundled version, skip the
    // disk-install/load flow entirely and return the bundled module.
    if (name in BUILTIN_BUILDERS) {
      const builtinVersion = getBuiltinBuilderVersion();
      const versionOk =
        parsed.type === 'tag' ||
        parsed.type === 'alias' ||
        (parsed.type === 'version' && parsed.rawSpec === builtinVersion) ||
        (parsed.type === 'range' && satisfies(builtinVersion, parsed.rawSpec));
      if (versionOk) {
        try {
          const mod = await BUILTIN_BUILDERS[name]();
          const builder = unwrapEsmDefault(mod);
          builders.set(spec, {
            builder,
            pkg: { name, version: builtinVersion },
            path: name,
            pkgPath: name,
            dynamicallyInstalled: false,
          });
          output.debug(`Imported bundled Builder "${name}@${builtinVersion}"`);
          continue;
        } catch (err) {
          output.debug(
            `Failed to load bundled Builder "${name}": ${
              err instanceof Error ? err.message : String(err)
            }`
          );
          // Fall through to disk path
        }
      }
    }

    try {
      let pkgPath: string | undefined;
      let builderPkg: PackageJson | undefined;

      try {
        // First try `.vercel/builders`. The package name should always be available
        // at the top-level of `node_modules` since CLI is installing those directly.
        pkgPath = join(buildersDir, 'node_modules', name, 'package.json');
        builderPkg = await readJSON(pkgPath);
      } catch (error: unknown) {
        if (!isErrnoException(error)) {
          throw error;
        }
        if (error.code !== 'ENOENT') {
          throw error;
        }

        // If `pkgPath` wasn't found in `.vercel/builders` then try as a CLI local
        // dependency. `require.resolve()` will throw if the Builder is not a CLI
        // dep, in which case we'll install it into `.vercel/builders`.
        pkgPath = require_.resolve(`${name}/package.json`, {
          paths: [__dirname],
        });
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

      if (parsed.type === 'version' && parsed.rawSpec !== builderPkg.version) {
        // An explicit Builder version was specified but it does
        // not match the version that is currently installed
        output.debug(
          `Installed version "${name}@${builderPkg.version}" does not match "${parsed.rawSpec}"`
        );
        buildersToAdd.add(spec);
        continue;
      }

      if (
        parsed.type === 'range' &&
        !satisfies(builderPkg.version, parsed.rawSpec)
      ) {
        // An explicit Builder range was specified but it is not
        // compatible with the version that is currently installed
        output.debug(
          `Installed version "${name}@${builderPkg.version}" is not compatible with "${parsed.rawSpec}"`
        );
        buildersToAdd.add(spec);
        continue;
      }

      // TODO: handle `parsed.type === 'tag'` ("latest" vs. anything else?)
      const path = join(dirname(pkgPath), builderPkg.main || 'index.js');

      // Use a require bound to the builder's own location so nested requires
      // (e.g. `require('@vercel/error-utils')` inside @vercel/node) resolve
      // through the builder's node_modules chain — required for Bun compiled
      // binaries where __filename points into the virtual FS.
      const fileRequire = createRequire(path);
      const builder = fileRequire(path);

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
      output.debug(`Imported Builder "${name}" from "${dirname(pkgPath)}"`);
    } catch (err: any) {
      // `resolvedSpecs` is only passed into this function on the 2nd run,
      // so if MODULE_NOT_FOUND happens in that case then we don't want to
      // try to install again. Instead just pass through the error to the user
      if (err.code === 'MODULE_NOT_FOUND' && !resolvedSpecs) {
        output.debug(`Failed to import "${name}": ${err}`);
        buildersToAdd.add(spec);
      } else {
        err.message = `Importing "${name}": ${err.message}`;
        throw err;
      }
    }
  }

  // Add any Builders that are not yet present into `.vercel/builders`
  if (buildersToAdd.size > 0) {
    return { buildersToAdd };
  }

  return { builders };
}
