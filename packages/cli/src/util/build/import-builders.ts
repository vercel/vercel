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
  /**
   * the absolute path to the entrypoint for this builder (e.g. dist/index.js)
   */
  path: string;
  /**
   * absolute path to the package.json of the builder
   */
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

  let importResult = await resolveBuilders(buildersDir, builderSpecs);

  if ('buildersToAdd' in importResult) {
    const installResult = await installBuilders(
      buildersDir,
      importResult.buildersToAdd
    );

    importResult = await resolveBuilders(
      buildersDir,
      builderSpecs,
      installResult.resolvedSpecs
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
      });
      continue;
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

async function installBuilders(
  buildersDir: string,
  buildersToAdd: Set<string>
) {
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
  } catch (err: any) {
    if (err.code !== 'EEXIST') throw err;
  }

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
