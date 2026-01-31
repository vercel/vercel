import { URL } from 'url';
import plural from 'pluralize';
import npa from 'npm-package-arg';
import { satisfies } from 'semver';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import { mkdirp, outputJSON, readJSON, symlink } from 'fs-extra';
import { isStaticRuntime } from '@vercel/fs-detectors';
import type { BuilderV2, BuilderV3, PackageJson } from '@vercel/build-utils';
import execa from 'execa';
import * as staticBuilder from './static-builder';
import { VERCEL_DIR } from '../projects/link';
import readJSONFile from '../read-json-file';
import { CantParseJSONFile } from '../errors-ts';
import { isErrnoException, isError } from '@vercel/error-utils';
import cmd from '../output/cmd';
import code from '../output/code';
import type { Writable } from 'stream';
import output from '../../output-manager';

export interface BuilderWithPkg {
  path: string;
  pkgPath: string;
  builder: BuilderV2 | BuilderV3;
  pkg: PackageJson & { name: string };
}

type ResolveBuildersResult =
  | { buildersToAdd: Set<string> }
  | { builders: Map<string, BuilderWithPkg> };

// Get a real `require()` reference that esbuild won't mutate
const require_ = createRequire(__filename);

/**
 * Imports the specified Vercel Builders, installing any missing ones
 * into `.vercel/builders` if necessary.
 */
export async function importBuilders(
  builderSpecs: Set<string>,
  cwd: string
): Promise<Map<string, BuilderWithPkg>> {
  const buildersDir = join(cwd, VERCEL_DIR, 'builders');

  let importResult = await resolveBuilders(cwd, buildersDir, builderSpecs);

  if ('buildersToAdd' in importResult) {
    const installResult = await installBuilders(
      buildersDir,
      importResult.buildersToAdd
    );

    // resolve builders again, after they've been installed
    // with specs from the newly installed builders.
    importResult = await resolveBuilders(
      cwd,
      buildersDir,
      builderSpecs,
      installResult.resolvedSpecs
    );

    // We shouldn't buildersToAdd a second time from resolveBuilders.
    if ('buildersToAdd' in importResult) {
      throw new Error('Something went wrong!');
    }
  }

  return importResult.builders;
}

// Cache for CLI package.json peerDependencies
let peerDependencies: Record<string, string> | undefined;

function getPeerDependencies(): Record<string, string> {
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
      });
      continue;
    }

    // Resolution priority:
    // 1. Project's node_modules (cwd)
    // 2. .vercel/builders (where we install builders)
    // 3. peerDeps version (install if specified and not found)
    // 4. CLI's node_modules (wherever CLI is installed - globally or as a project dep)

    let pkgPath: string | undefined;
    let builderPkg: PackageJson | undefined;
    const peerVersion = peerDeps[name];

    // 1. Try project's node_modules
    try {
      pkgPath = join(cwd, 'node_modules', name, 'package.json');
      const builderPkgJson: PackageJson = await readJSON(pkgPath);
      output.debug(
        `Found "${name}@${builderPkgJson.version}" in project's node_modules`
      );

      // Warn if version doesn't match peerDeps, but still use it
      // Note: we could use satisfies() to see if project version
      // satisfies peerVersion requirement, and do something different when it does and doesn't.
      if (peerVersion && builderPkgJson.version !== peerVersion) {
        output.warn(
          `"${name}@${builderPkgJson.version}" does not match expected "${peerVersion}"`
        );
      }
      builderPkg = builderPkgJson;
    } catch (err: unknown) {
      if (!isErrnoException(err) || err.code !== 'ENOENT') {
        throw err;
      }
      output.debug(
        `"${name}@${peerVersion}" not found in project's node_modules`
      );
    }

    // 2. Try .vercel/builders (where we install builders)
    if (!builderPkg) {
      try {
        pkgPath = join(buildersDir, 'node_modules', name, 'package.json');
        const cachedPkg: PackageJson = await readJSON(pkgPath);
        output.debug(
          `Found "${name}@${cachedPkg.version}" in .vercel/builders`
        );

        // Verify cached version matches peerDeps exactly
        if (peerVersion && cachedPkg.version !== peerVersion) {
          output.debug(
            `Cached "${name}@${cachedPkg.version}" does not match peerDep "${peerVersion}", will reinstall`
          );
          buildersToAdd.add(`${name}@${peerVersion}`);
          continue;
        }
        builderPkg = cachedPkg;
      } catch (err: unknown) {
        if (!isErrnoException(err) || err.code !== 'ENOENT') {
          throw err;
        }
        output.debug(`"${name}@${peerVersion}" not found in .vercel/builders`);
      }
    }

    // 3. If in peerDeps and not found yet, install it
    if (!builderPkg && peerVersion) {
      output.debug(
        `"${name}@${peerVersion}" not found in project or .vercel/builders, will install`
      );
      buildersToAdd.add(`${name}@${peerVersion}`);
      continue;
    }

    // 4. Try CLI's node_modules (wherever CLI is installed - globally or as a project dep)
    if (!builderPkg) {
      try {
        pkgPath = require_.resolve(`${name}/package.json`, {
          paths: [__dirname],
        });
        builderPkg = await readJSON(pkgPath);
        output.debug(`Found "${name}" in CLI's node_modules`);
      } catch (err: unknown) {
        if (
          !isErrnoException(err) ||
          (err as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND'
        ) {
          throw err;
        }
        // Not found anywhere and no peerDep - this is an error on second run
        if (resolvedSpecs) {
          throw new Error(`Builder "${name}" not found`);
        }
        output.debug(`"${name}" not found anywhere, will install`);
        buildersToAdd.add(spec);
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

    // Validate explicit version/range requirements from spec
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

    builders.set(spec, {
      builder,
      pkg: {
        name,
        ...builderPkg,
      },
      path,
      pkgPath,
    });
    output.debug(`Imported Builder "${name}" from "${dirname(pkgPath)}"`);
  }

  // Add any Builders that are not yet present into `.vercel/builders`
  if (buildersToAdd.size > 0) {
    return { buildersToAdd };
  }

  return { builders };
}

async function installBuilders(
  buildersDir: string,
  buildersToAdd: Set<string>
) {
  const resolvedSpecs = new Map<string, string>();

  // First create an empty package.json in the cache dir where
  // we store our downloaded builders.
  const buildersPkgPath = join(buildersDir, 'package.json');
  try {
    const emptyPkgJson = {
      private: true,
      license: 'UNLICENSED',
    };
    await outputJSON(buildersPkgPath, emptyPkgJson, {
      flag: 'wx',
    });
  } catch (err: any) {
    if (err.code !== 'EEXIST') throw err;
  }

  // Then npm install the list of packages we need to install.
  output.log(
    `Installing ${plural('Builder', buildersToAdd.size)}: ${Array.from(
      buildersToAdd
    ).join(', ')}`
  );
  try {
    const { stderr } = await execa(
      'npm',
      ['install', '@vercel/build-utils', ...buildersToAdd],
      {
        cwd: buildersDir,
        stdio: 'pipe',
        reject: true,
      }
    );
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
        if (notFound) {
          const url = new URL(notFound[1]);
          const packageName = decodeURIComponent(url.pathname.slice(1));
          message = `The package ${code(
            packageName
          )} is not published on the npm registry`;
        }
      }
      err.message = message;
      (err as any).link =
        'https://vercel.link/builder-dependencies-install-failed';
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
  if (buildersPkg instanceof CantParseJSONFile) throw buildersPkg;
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

  return { resolvedSpecs };
}

type BonusError = Error & {
  stderr?: string | Writable;
};

function getErrorMessage(err: BonusError, execaMessage: string) {
  if (!err || !('stderr' in err)) {
    return execaMessage;
  }

  if (typeof err.stderr === 'string') {
    return err.stderr;
  }

  return execaMessage;
}
