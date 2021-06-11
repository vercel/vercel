import { join, dirname } from 'path';
import execa from 'execa';
import {
  ensureDir,
  move,
  remove,
  pathExists,
  readFile,
  writeFile,
} from 'fs-extra';
import buildUtils from './build-utils';
import { BuildOptions } from '@vercel/build-utils';
const {
  download,
  getWriteableDirectory,
  glob,
  createLambda,
  debug,
  walkParentDirs,
} = buildUtils;
import { installBundler } from './install-ruby';

async function matchPaths(
  configPatterns: string | string[] | undefined,
  workPath: string
) {
  const patterns =
    typeof configPatterns === 'string' ? [configPatterns] : configPatterns;

  if (!patterns) {
    return [];
  }

  const patternPaths = await Promise.all(
    patterns.map(async pattern => {
      const files = await glob(pattern, workPath);
      return Object.keys(files);
    })
  );

  return patternPaths.reduce((a, b) => a.concat(b), []);
}

async function bundleInstall(
  bundlePath: string,
  bundleDir: string,
  gemfilePath: string
) {
  debug(`running "bundle install --deployment"...`);
  const bundleAppConfig = await getWriteableDirectory();

  try {
    await execa(
      bundlePath,
      [
        'install',
        '--deployment',
        '--gemfile',
        gemfilePath,
        '--path',
        bundleDir,
      ],
      {
        stdio: 'pipe',
        env: {
          BUNDLE_SILENCE_ROOT_WARNING: '1',
          BUNDLE_APP_CONFIG: bundleAppConfig,
          BUNDLE_JOBS: '4',
        },
      }
    );
  } catch (err) {
    debug(`failed to run "bundle install --deployment"...`);
    throw err;
  }
}

export const version = 3;

export async function build({
  workPath,
  files,
  entrypoint,
  config,
  meta = {},
}: BuildOptions) {
  await download(files, workPath, meta);
  const entrypointFsDirname = join(workPath, dirname(entrypoint));
  const gemfilePath = await walkParentDirs({
    base: workPath,
    start: entrypointFsDirname,
    filename: 'Gemfile',
  });
  const gemfileContents = gemfilePath
    ? await readFile(gemfilePath, 'utf8')
    : '';
  const { gemHome, bundlerPath, vendorPath, runtime } = await installBundler(
    meta,
    gemfileContents
  );
  process.env.GEM_HOME = gemHome;
  debug(`Checking existing vendor directory at "${vendorPath}"`);
  const vendorDir = join(workPath, vendorPath);
  const bundleDir = join(workPath, 'vendor', 'bundle');
  const relativeVendorDir = join(entrypointFsDirname, vendorPath);
  const hasRootVendorDir = await pathExists(vendorDir);
  const hasRelativeVendorDir = await pathExists(relativeVendorDir);
  const hasVendorDir = hasRootVendorDir || hasRelativeVendorDir;

  if (hasRelativeVendorDir) {
    if (hasRootVendorDir) {
      debug(
        'found two vendor directories, choosing the vendor directory relative to entrypoint'
      );
    } else {
      debug('found vendor directory relative to entrypoint');
    }

    // vendor dir must be at the root for lambda to find it
    await move(relativeVendorDir, vendorDir);
  } else if (hasRootVendorDir) {
    debug('found vendor directory in project root');
  }

  await ensureDir(vendorDir);

  // no vendor directory, check for Gemfile to install
  if (!hasVendorDir) {
    if (gemfilePath) {
      debug(
        'did not find a vendor directory but found a Gemfile, bundling gems...'
      );

      // try installing. this won't work if native extesions are required.
      // if that's the case, gems should be vendored locally before deploying.
      try {
        await bundleInstall(bundlerPath, bundleDir, gemfilePath);
      } catch (err) {
        debug(
          'unable to build gems from Gemfile. vendor the gems locally with "bundle install --deployment" and retry.'
        );
        throw err;
      }
    }
  } else {
    debug('found vendor directory, skipping "bundle install"...');
  }

  // try to remove gem cache to slim bundle size
  try {
    await remove(join(vendorDir, 'cache'));
  } catch (e) {
    // don't do anything here
  }

  const originalRbPath = join(__dirname, '..', 'vc_init.rb');
  const originalHandlerRbContents = await readFile(originalRbPath, 'utf8');

  // will be used on `require_relative '$here'` or for loading rack config.ru file
  // for example, `require_relative 'api/users'`
  debug('entrypoint is', entrypoint);
  const userHandlerFilePath = entrypoint.replace(/\.rb$/, '');
  const nowHandlerRbContents = originalHandlerRbContents.replace(
    /__VC_HANDLER_FILENAME/g,
    userHandlerFilePath
  );

  // in order to allow the user to have `server.rb`, we need our `server.rb` to be called
  // somethig else
  const handlerRbFilename = 'vc__handler__ruby';

  await writeFile(
    join(workPath, `${handlerRbFilename}.rb`),
    nowHandlerRbContents
  );

  const outputFiles = await glob('**', workPath);

  // static analysis is impossible with ruby.
  // instead, provide `includeFiles` and `excludeFiles` config options to reduce bundle size.
  if (config && (config.includeFiles || config.excludeFiles)) {
    const includedPaths = await matchPaths(config.includeFiles, workPath);
    const excludedPaths = await matchPaths(
      config.excludeFiles as string | string[],
      workPath
    );

    for (let i = 0; i < excludedPaths.length; i++) {
      // whitelist includeFiles
      if (includedPaths.includes(excludedPaths[i])) {
        continue;
      }

      // whitelist handler
      if (excludedPaths[i] === `${handlerRbFilename}.rb`) {
        continue;
      }

      // whitelist vendor directory
      if (excludedPaths[i].startsWith(vendorPath)) {
        continue;
      }

      delete outputFiles[excludedPaths[i]];
    }
  }

  const lambda = await createLambda({
    files: outputFiles,
    handler: `${handlerRbFilename}.vc__handler`,
    runtime,
    environment: {},
  });

  return { output: lambda };
}
