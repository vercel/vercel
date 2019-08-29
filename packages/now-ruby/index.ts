import { join, dirname } from 'path';
import execa from 'execa';
import {
  ensureDir,
  move,
  remove,
  pathExists,
  readFile,
  writeFile
} from 'fs-extra';
import {
  download,
  getWriteableDirectory,
  glob,
  createLambda,
  BuildOptions,
  debug
} from '@now/build-utils';
import { installBundler } from './install-ruby';

const REQUIRED_VENDOR_DIR = 'vendor/bundle/ruby/2.5.0';

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
        bundleDir
      ],
      {
        stdio: 'pipe',
        env: {
          BUNDLE_SILENCE_ROOT_WARNING: '1',
          BUNDLE_APP_CONFIG: bundleAppConfig,
          BUNDLE_JOBS: '4'
        }
      }
    );
  } catch (err) {
    debug(`failed to run "bundle install --deployment"...`);
    throw err;
  }
}

export const build = async ({
  workPath,
  files,
  entrypoint,
  config
}: BuildOptions) => {
  debug('downloading files...');

  await download(files, workPath);

  const { gemHome, bundlerPath } = await installBundler();
  process.env.GEM_HOME = gemHome;

  const fsFiles = await glob('**', workPath);
  const entryDirectory = dirname(entrypoint);
  const fsEntryDirectory = dirname(fsFiles[entrypoint].fsPath);

  // check for an existing vendor directory
  debug(
    'checking for existing vendor directory at',
    '"' + REQUIRED_VENDOR_DIR + '"'
  );
  const vendorDir = join(workPath, REQUIRED_VENDOR_DIR);
  const bundleDir = join(workPath, 'vendor/bundle');
  const relativeVendorDir = join(fsEntryDirectory, REQUIRED_VENDOR_DIR);

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
    const gemFile = join(entryDirectory, 'Gemfile');

    if (fsFiles[gemFile]) {
      debug(
        'did not find a vendor directory but found a Gemfile, bundling gems...'
      );
      const gemfilePath = fsFiles[gemFile].fsPath;

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

  const originalRbPath = join(__dirname, '..', 'now_init.rb');
  const originalNowHandlerRbContents = await readFile(originalRbPath, 'utf8');

  // will be used on `require_relative '$here'` or for loading rack config.ru file
  // for example, `require_relative 'api/users'`
  debug('entrypoint is', entrypoint);
  const userHandlerFilePath = entrypoint.replace(/\.rb$/, '');
  const nowHandlerRbContents = originalNowHandlerRbContents.replace(
    /__NOW_HANDLER_FILENAME/g,
    userHandlerFilePath
  );

  // in order to allow the user to have `server.rb`, we need our `server.rb` to be called
  // somethig else
  const nowHandlerRbFilename = 'now__handler__ruby';

  await writeFile(
    join(workPath, `${nowHandlerRbFilename}.rb`),
    nowHandlerRbContents
  );

  const outputFiles = await glob('**', workPath);

  // static analysis is impossible with ruby.
  // instead, provide `includeFiles` and `excludeFiles` config options to reduce bundle size.
  if (config && (config.includeFiles || config.excludeFiles)) {
    const includedPaths = await matchPaths(config.includeFiles, workPath);
    const excludedPaths = await matchPaths(
      <string | string[]>config.excludeFiles,
      workPath
    );

    for (let i = 0; i < excludedPaths.length; i++) {
      // whitelist includeFiles
      if (includedPaths.includes(excludedPaths[i])) {
        continue;
      }

      // whitelist handler
      if (excludedPaths[i] === `${nowHandlerRbFilename}.rb`) {
        continue;
      }

      // whitelist vendor directory
      if (excludedPaths[i].startsWith(REQUIRED_VENDOR_DIR)) {
        continue;
      }

      delete outputFiles[excludedPaths[i]];
    }
  }

  const lambda = await createLambda({
    files: outputFiles,
    handler: `${nowHandlerRbFilename}.now__handler`,
    runtime: 'ruby2.5',
    environment: {}
  });

  return {
    [entrypoint]: lambda
  };
};
