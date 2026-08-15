import { URL } from 'url';
import plural from 'pluralize';
import { join } from 'path';
import { validRange } from 'semver';
import { mkdirp, outputJSON, symlink } from 'fs-extra';
import type { PackageJson, Span } from '@vercel/build-utils';
import execa from 'execa';
import cliPkg from '../pkg';
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

async function untracedInstallBuilders(
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
  const buildUtilsVersion = cliPkg.dependencies?.['@vercel/build-utils'];
  const buildUtilsSpec =
    buildUtilsVersion && validRange(buildUtilsVersion)
      ? `@vercel/build-utils@${buildUtilsVersion}`
      : '@vercel/build-utils';

  const installArgs = ['install', buildUtilsSpec, ...buildersToAdd];

  try {
    const { stderr } = await execa('npm', installArgs, {
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
        if (notFound) {
          const url = new URL(notFound[1]);
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
  span?: Span,
  installReasons?: Map<string, string>,
  /**
   * Bare specs rewritten to `name@pin` from `package.json#builders`.
   * When present, the install span is tagged so we can track dynamic installs
   * of builders we intend to preinstall.
   */
  pinnedSpecs?: Map<string, string>
): Promise<Map<string, string>> {
  const install = async () => {
    try {
      return await untracedInstallBuilders(buildersDir, buildersToAdd);
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
        fallbackSpecs
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
}
