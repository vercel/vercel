import npa from 'npm-package-arg';
import { satisfies } from 'semver';
import { dirname, join } from 'path';
import { mkdirp, readJSON, writeFile } from 'fs-extra';
import {
  BuilderV2,
  BuilderV3,
  PackageJson,
  spawnAsync,
} from '@vercel/build-utils';
import * as staticBuilder from './static-builder';
import { VERCEL_DIR } from '../projects/link';
import { Output } from '../output';
import readJSONFile from '../read-json-file';
import { CantParseJSONFile } from '../errors-ts';

interface BuilderWithPkg {
  path: string;
  pkgPath: string;
  builder: BuilderV2 | BuilderV3;
  pkg: PackageJson;
}

/**
 * Imports the specified Vercel Builders, installing any missing ones
 * into `.vercel/builders` if necessary.
 */
export async function importBuilders(
  builderSpecs: Set<string>,
  cwd: string,
  output: Output
): Promise<Map<string, BuilderWithPkg>> {
  const results = new Map<string, BuilderWithPkg>();
  const resolvedSpecs = new Map<string, string>();

  const buildersDir = join(cwd, VERCEL_DIR, 'builders');
  const buildersPkgPath = join(buildersDir, 'package.json');

  const requirePaths = [
    // Prefer to load from `.vercel/builders` first, to allow for projects
    // to override a version of a Builder that CLI provides by default
    buildersDir,
    // If CLI provides the Builder, then load from there as well
    __dirname,
  ];

  do {
    const buildersToAdd = new Set<string>();

    for (const spec of builderSpecs) {
      const resolvedSpec = resolvedSpecs.get(spec) || spec;
      const parsed = npa(resolvedSpec);

      let { name } = parsed;
      if (!name) {
        // A URL was specified - will need to install it and resolve the
        // proper package name from the written `package.json` file
        buildersToAdd.add(spec);
        continue;
      }

      if (name === '@vercel/static') {
        // `@vercel/static` is a special-case built-in builder
        results.set(name, {
          builder: staticBuilder,
          pkg: { name },
          path: '',
          pkgPath: '',
        });
        continue;
      }

      try {
        const pkgPath = require.resolve(`${name}/package.json`, {
          paths: requirePaths,
        });
        const builderPkg = await readJSON(pkgPath);

        if (
          parsed.type === 'version' &&
          parsed.rawSpec !== builderPkg.version
        ) {
          // An explicit Builder version was specified but it does
          // not match the version that is currently installed
          buildersToAdd.add(spec);
          continue;
        }

        if (
          parsed.type === 'range' &&
          !satisfies(builderPkg.version, parsed.rawSpec)
        ) {
          // An explicit Builder range was specified but it is not
          // compatible with the version that is currently installed
          buildersToAdd.add(spec);
          continue;
        }

        // TODO: handle `parsed.type === 'tag'` ("latest" vs. anything else?)

        const path = require.resolve(name, {
          paths: requirePaths,
        });
        const builder = await import(path);

        results.set(spec, {
          builder,
          pkg: builderPkg,
          path: path,
          pkgPath: pkgPath,
        });
        output.debug(`Imported Builder "${name}" from "${dirname(pkgPath)}"`);
      } catch (err: any) {
        if (err.code === 'MODULE_NOT_FOUND') {
          buildersToAdd.add(spec);
        } else {
          throw err;
        }
      }
    }

    // Add any Builders that are not yet present into `.vercel/builders`
    if (buildersToAdd.size > 0) {
      await mkdirp(buildersDir);
      try {
        await writeFile(buildersPkgPath, '{}', {
          flag: 'wx',
        });
      } catch (err: any) {
        if (err.code !== 'EEXIST') throw err;
      }

      output.debug(
        `Installing Builders: ${Array.from(buildersToAdd).join(', ')}`
      );
      await spawnAsync(
        'yarn',
        ['add', '@vercel/build-utils', ...buildersToAdd],
        { cwd: buildersDir }
      );

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
    }
  } while (results.size !== builderSpecs.size);

  return results;
}
