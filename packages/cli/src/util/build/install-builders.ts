import { URL } from 'url';
import plural from 'pluralize';
import { join } from 'path';
import { mkdirp, outputJSON, symlink } from 'fs-extra';
import type { PackageJson, Span } from '@vercel/build-utils';
import execa from 'execa';
import readJSONFile from '../read-json-file';
import { CantParseJSONFile } from '../errors-ts';
import { isErrnoException, isError } from '@vercel/error-utils';
import cmd from '../output/cmd';
import code from '../output/code';
import type { Writable } from 'stream';
import output from '../../output-manager';

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

export async function untracedInstallBuilders(
  buildersDir: string,
  buildersToAdd: Set<string>
): Promise<Map<string, string>> {
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

  return resolvedSpecs;
}

export async function installBuilders(
  buildersDir: string,
  buildersToAdd: Set<string>,
  span: Span
): Promise<Map<string, string>> {
  const installSpan = span.child('vc.installBuilders', {
    packages: Array.from(buildersToAdd).join(','),
  });
  return installSpan.trace(async s => {
    try {
      return await untracedInstallBuilders(buildersDir, buildersToAdd);
    } catch (err) {
      s.setAttributes({
        error: isError(err) ? err.message : String(err),
      });
      throw err;
    }
  });
}
