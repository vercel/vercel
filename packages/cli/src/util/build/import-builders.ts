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

// Cache for CLI package.json peerDependencies
let peerDependencies: Record<string, string> | undefined;

export function getPeerDependencies(): Record<string, string> {
  if (!peerDependencies) {
    try {
      const cliPkgPath = require_.resolve('vercel/package.json', {
        paths: [__dirname],
      });
      const cliPkg = require_(cliPkgPath) as PackageJson;
      peerDependencies =
        (cliPkg.peerDependencies as Record<string, string>) || {};
    } catch {
      peerDependencies = {};
    }
  }
  return peerDependencies;
}

/**
 * Reset the cached peerDependencies (for testing).
 */
export function resetPeerDependenciesCache() {
  peerDependencies = undefined;
}

/**
 * Override the cached peerDependencies (for testing).
 */
export function setPeerDependenciesForTesting(deps: Record<string, string>) {
  peerDependencies = deps;
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

  let importResult = await resolveBuilders(cwd, buildersDir, builderSpecs);

  if ('buildersToAdd' in importResult) {
    const { buildersToAdd } = importResult;
    const installResult = await installBuilders(
      buildersDir,
      buildersToAdd,
      span
    );

    importResult = await resolveBuilders(
      cwd,
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

export async function resolveBuilders(
  cwd: string,
  buildersDir: string,
  builderSpecs: Set<string>,
  resolvedSpecs?: Map<string, string>
): Promise<ResolveBuildersResult> {
  const builders = new Map<string, BuilderWithPkg>();
  const buildersToAdd = new Set<string>();
  const peerDeps = getPeerDependencies();

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

    // Resolution priority:
    // 1. Peer dependency location (cwd's node_modules) — for when CLI is a project dependency
    // 2. .vercel/builders (dynamically installed builders cache)
    // 3. CLI's bundled node_modules (where CLI itself is installed)
    // 4. Install into .vercel/builders from npm

    let pkgPath: string | undefined;
    let builderPkg: PackageJson | undefined;
    const peerVersion = peerDeps[name];

    output.debug(
      `Resolving "${name}" (peerDep: ${peerVersion ? `"${peerVersion}"` : 'none'})`
    );

    // 1. Try peer dependency location (cwd's node_modules)
    if (peerVersion) {
      try {
        const cwdRequire = createRequire(join(cwd, 'noop.js'));
        const candidatePkgPath = cwdRequire.resolve(`${name}/package.json`);
        const candidatePkg: PackageJson = await readJSON(candidatePkgPath);

        if (candidatePkg.version === peerVersion) {
          output.debug(
            `Found "${name}@${candidatePkg.version}" in peer dependencies location (matches peerDep "${peerVersion}")`
          );
          pkgPath = candidatePkgPath;
          builderPkg = candidatePkg;
        } else {
          output.debug(
            `Found "${name}@${candidatePkg.version}" in peer dependencies location, but does not match peerDep "${peerVersion}", skipping`
          );
        }
      } catch (err: unknown) {
        if (!isErrnoException(err) || err.code !== 'MODULE_NOT_FOUND') {
          throw err;
        }
        output.debug(
          `"${name}" not found in peer dependencies location (cwd: ${cwd})`
        );
      }
    }

    // 2. Try .vercel/builders (dynamically installed cache)
    if (!builderPkg) {
      output.debug(`[resolve] "${name}" step 2: trying .vercel/builders`);
      try {
        const candidatePkgPath = join(
          buildersDir,
          'node_modules',
          name,
          'package.json'
        );
        const candidatePkg: PackageJson = await readJSON(candidatePkgPath);
        output.debug(
          `Found "${name}@${candidatePkg.version}" in .vercel/builders`
        );

        // If there's a peer dep version, verify cache matches it
        if (peerVersion && candidatePkg.version !== peerVersion) {
          output.debug(
            `"${name}@${candidatePkg.version}" in .vercel/builders does not match peerDep "${peerVersion}", will reinstall`
          );
          buildersToAdd.add(`${name}@${peerVersion}`);
          continue;
        }

        pkgPath = candidatePkgPath;
        builderPkg = candidatePkg;
      } catch (err: unknown) {
        if (!isErrnoException(err) || err.code !== 'ENOENT') {
          throw err;
        }
      }
    }

    // 3. Try CLI's bundled node_modules
    if (!builderPkg) {
      output.debug(`[resolve] "${name}" step 3: trying CLI bundle`);
      try {
        pkgPath = require_.resolve(`${name}/package.json`, {
          paths: [__dirname],
        });
        builderPkg = await readJSON(pkgPath);
        output.debug(`Found "${name}@${builderPkg?.version}" in CLI bundle`);
      } catch (err: unknown) {
        if (!isErrnoException(err) || err.code !== 'MODULE_NOT_FOUND') {
          throw err;
        }
        // Not found in any local location — mark for install
        if (resolvedSpecs) {
          // This is the 2nd pass after install — don't try again
          throw new Error(`Builder "${name}" not found after installation`);
        }
        output.debug(`"${name}" not found anywhere, will install`);
        buildersToAdd.add(peerVersion ? `${name}@${peerVersion}` : spec);
        continue;
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

    // Validate explicit version/range requirements from the spec
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

    const builder = require_(path);

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
  }

  // Add any Builders that are not yet present into `.vercel/builders`
  if (buildersToAdd.size > 0) {
    return { buildersToAdd };
  }

  return { builders };
}
