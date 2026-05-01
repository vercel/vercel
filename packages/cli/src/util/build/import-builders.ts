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
import { isVercelCliBinary } from '../is-bun-binary';

export interface BuilderWithPkg {
  path: string;
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

const require_ = createRequire(__filename);

type BuilderPackageJson = PackageJson & { version: string };

const goPkg = require_('@vercel/go/package.json') as BuilderPackageJson;
const hydrogenPkg = require_(
  '@vercel/hydrogen/package.json'
) as BuilderPackageJson;
const nextPkg = require_('@vercel/next/package.json') as BuilderPackageJson;
const nodePkg = require_('@vercel/node/package.json') as BuilderPackageJson;
const pythonPkg = require_('@vercel/python/package.json') as BuilderPackageJson;
const redwoodPkg = require_(
  '@vercel/redwood/package.json'
) as BuilderPackageJson;
const remixPkg = require_(
  '@vercel/remix-builder/package.json'
) as BuilderPackageJson;
const rubyPkg = require_('@vercel/ruby/package.json') as BuilderPackageJson;
const rustPkg = require_('@vercel/rust/package.json') as BuilderPackageJson;
const staticBuildPkg = require_(
  '@vercel/static-build/package.json'
) as BuilderPackageJson;

// Compiled binaries cannot rely on resolving bundled builders from disk.
const BUILTIN_BUILDERS: Record<
  string,
  { load: () => Promise<unknown>; version: string }
> = {
  '@vercel/go': { load: () => import('@vercel/go'), version: goPkg.version },
  '@vercel/hydrogen': {
    load: () => import('@vercel/hydrogen'),
    version: hydrogenPkg.version,
  },
  '@vercel/next': {
    load: () => import('@vercel/next'),
    version: nextPkg.version,
  },
  '@vercel/node': {
    load: () => import('@vercel/node'),
    version: nodePkg.version,
  },
  '@vercel/python': {
    load: () => import('@vercel/python'),
    version: pythonPkg.version,
  },
  '@vercel/redwood': {
    load: () => import('@vercel/redwood'),
    version: redwoodPkg.version,
  },
  '@vercel/remix-builder': {
    load: () => import('@vercel/remix-builder'),
    version: remixPkg.version,
  },
  '@vercel/ruby': {
    load: () => import('@vercel/ruby'),
    version: rubyPkg.version,
  },
  '@vercel/rust': {
    load: () => import('@vercel/rust'),
    version: rustPkg.version,
  },
  '@vercel/static-build': {
    load: () => import('@vercel/static-build'),
    version: staticBuildPkg.version,
  },
};

function unwrapEsmDefault(mod: unknown): BuilderV2 | BuilderV3 | BuilderVX {
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
      buildersToAdd.add(spec);
      continue;
    }

    if (isStaticRuntime(name)) {
      builders.set(name, {
        builder: staticBuilder,
        pkg: { name },
        path: '',
        pkgPath: '',
        dynamicallyInstalled: false,
      });
      continue;
    }

    if (isVercelCliBinary() && name in BUILTIN_BUILDERS) {
      const builtinVersion = BUILTIN_BUILDERS[name].version;
      const versionOk =
        parsed.type === 'tag' ||
        parsed.type === 'alias' ||
        (parsed.type === 'version' && parsed.rawSpec === builtinVersion) ||
        (parsed.type === 'range' && satisfies(builtinVersion, parsed.rawSpec));
      if (versionOk) {
        try {
          const mod = await BUILTIN_BUILDERS[name].load();
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
        }
      }
    }

    try {
      let pkgPath: string | undefined;
      let builderPkg: PackageJson | undefined;

      try {
        pkgPath = join(buildersDir, 'node_modules', name, 'package.json');
        builderPkg = await readJSON(pkgPath);
      } catch (error: unknown) {
        if (!isErrnoException(error)) {
          throw error;
        }
        if (error.code !== 'ENOENT') {
          throw error;
        }

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
      if (err.code === 'MODULE_NOT_FOUND' && !resolvedSpecs) {
        output.debug(`Failed to import "${name}": ${err}`);
        buildersToAdd.add(spec);
      } else {
        err.message = `Importing "${name}": ${err.message}`;
        throw err;
      }
    }
  }

  if (buildersToAdd.size > 0) {
    return { buildersToAdd };
  }

  return { builders };
}
