import { dirname, join } from 'path';
import npa from 'npm-package-arg';
import { mkdirp, writeFile } from 'fs-extra';
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
  builder: BuilderV2 | BuilderV3;
  pkg: PackageJson;
  builderPath: string;
  builderPkgPath: string;
}

/**
 * Imports the specified Vercel Builders, installing any missing ones
 * into `.vercel/builders` if necessary.
 *
 * @param builderSpecs
 * @param cwd
 */
export async function importBuilders(
  builderSpecs: Set<string>,
  cwd: string,
  output: Output
): Promise<Map<string, BuilderWithPkg>> {
  console.log({ builderSpecs, cwd });
  const results = new Map<string, BuilderWithPkg>();
  const resolvedSpecs = new Map<string, string>();

  const buildersDir = join(cwd, VERCEL_DIR, 'builders');
  const buildersDirPkgPath = join(buildersDir, 'package.json');

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
        // @ts-ignore
        results.set(name, {
          builder: staticBuilder,
          pkg: {},
        });
        continue;
      }

      try {
        const path = require.resolve(name, {
          paths: requirePaths,
        });
        const pkgPath = require.resolve(`${name}/package.json`, {
          paths: requirePaths,
        });
        //console.log({ name, path, pkgPath });
        const [builder, builderPkg] = await Promise.all([
          import(path),
          import(pkgPath),
        ]);
        results.set(spec, {
          builder,
          pkg: builderPkg,
          builderPath: path,
          builderPkgPath: pkgPath,
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
        await writeFile(buildersDirPkgPath, '{}', {
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
      const buildersDirPkg = await readJSONFile<PackageJson>(
        buildersDirPkgPath
      );
      if (buildersDirPkg instanceof CantParseJSONFile) throw buildersDirPkg;
      if (!buildersDirPkg) {
        throw new Error(`Failed to load "${buildersDirPkgPath}"`);
      }
      for (const spec of buildersToAdd) {
        for (const [name, version] of Object.entries(
          buildersDirPkg.dependencies || {}
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
