import { EOL, release } from 'os';
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
import {
  download,
  getWriteableDirectory,
  glob,
  Lambda,
  debug,
  walkParentDirs,
  cloneEnv,
  FileBlob,
  type GlobOptions,
  type Files,
  type BuildV3,
  type ShouldServe,
} from '@vercel/build-utils';
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

async function prepareGemfile(
  gemfilePath: string,
  major: number
): Promise<{ modified: boolean }> {
  let gemfile = await readFile(gemfilePath, 'utf8');
  let modified = false;

  const patchRuby = (from: string, to: string) => {
    if (gemfile.includes(from)) {
      gemfile = gemfile.replace(from, to);
      modified = true;
    }
  };

  // Gemfiles containing the following will cause an error message:
  // "Your Ruby patchlevel is 0, but your Gemfile specified -1"
  // See https://github.com/rubygems/bundler/blob/3f0638c6c8d340c2f2405ecb84eb3b39c433e36e/lib/bundler/errors.rb#L49
  // We must correct to the actual version in the build container.
  patchRuby('ruby "~> 3.3.x"', 'ruby "~> 3.3.0"');
  patchRuby('ruby "~> 3.2.x"', 'ruby "~> 3.2.0"');
  patchRuby('ruby "~> 2.7.x"', 'ruby "~> 2.7.0"');

  // "webrick" needs to be installed for Ruby 3+ to fix runtime error:
  // webrick is not part of the default gems since Ruby 3.0.0. Install webrick from RubyGems.
  const containsWebrick = /^[^#]*\bgem\s+["']webrick["']/m.test(gemfile);
  if (major >= 3 && !containsWebrick) {
    gemfile += `${EOL}gem "webrick"${EOL}`;
    modified = true;
  }

  if (modified) {
    await writeFile(gemfilePath, gemfile);
  }

  return { modified };
}

async function bundleLock(
  bundlerPath: string,
  gemfilePath: string,
  rubyPath: string
) {
  const bundleAppConfig = await getWriteableDirectory();
  const bundlerEnv = cloneEnv(process.env, {
    PATH: `${dirname(rubyPath)}:${dirname(bundlerPath)}:${process.env.PATH}`,
    BUNDLE_SILENCE_ROOT_WARNING: '1',
    BUNDLE_APP_CONFIG: bundleAppConfig,
    BUNDLE_JOBS: '4',
  });

  const archTokenLinux = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  const linuxPlatform = `${archTokenLinux}-linux`;
  const platforms = [linuxPlatform];
  if (process.platform === 'darwin') {
    const darwinArchToken = process.arch === 'arm64' ? 'arm64' : 'x86_64';
    const darwinMajor = Number(release().split('.')[0]) || undefined;
    const darwinPlatform = darwinMajor
      ? `${darwinArchToken}-darwin-${darwinMajor}`
      : `${darwinArchToken}-darwin`;
    platforms.push(darwinPlatform);
  }
  debug(`ruby: ensuring Gemfile.lock has platforms ${platforms.join(', ')}`);

  const lockArgs = ['lock'];
  for (const platform of platforms) {
    lockArgs.push('--add-platform', platform);
  }
  const lockRes = await execa(bundlerPath, lockArgs, {
    cwd: dirname(gemfilePath),
    stdio: 'pipe',
    env: bundlerEnv,
    reject: false,
  });
  if (lockRes.exitCode !== 0) {
    console.log(lockRes.stdout);
    console.error(lockRes.stderr);
    throw lockRes;
  }
}

async function bundleInstall(
  bundlePath: string,
  bundleDir: string,
  gemfilePath: string,
  rubyPath: string
) {
  const bundleAppConfig = await getWriteableDirectory();
  const bundlerEnv = cloneEnv(process.env, {
    PATH: `${dirname(rubyPath)}:${dirname(bundlePath)}:${process.env.PATH}`,
    BUNDLE_SILENCE_ROOT_WARNING: '1',
    BUNDLE_APP_CONFIG: bundleAppConfig,
    BUNDLE_JOBS: '4',
    BUNDLE_DEPLOYMENT: 'true',
    BUNDLE_PATH: bundleDir,
    BUNDLE_FROZEN: 'true',
  });

  debug('running "bundle install"');
  const installRes = await execa(
    bundlePath,
    ['install', '--gemfile', gemfilePath],
    {
      stdio: 'pipe',
      env: bundlerEnv,
      reject: false,
    }
  );

  if (installRes.exitCode !== 0) {
    console.log(installRes.stdout);
    console.error(installRes.stderr);
    throw installRes;
  }
}

export const version = 3;

export const build: BuildV3 = async ({
  workPath,
  files,
  entrypoint,
  config,
  meta = {},
}) => {
  await download(files, workPath, meta);
  const entrypointFsDirname = join(workPath, dirname(entrypoint));
  const gemfileName = 'Gemfile';

  let gemfilePath = await walkParentDirs({
    base: workPath,
    start: entrypointFsDirname,
    filename: gemfileName,
  });

  // Ensure a `Gemfile` exists so that webrick can be installed for Ruby 3.2
  if (!gemfilePath) {
    gemfilePath = join(entrypointFsDirname, gemfileName);
    await writeFile(gemfilePath, `source "https://rubygems.org"${EOL}`);
  }

  const gemfileContents = gemfilePath
    ? await readFile(gemfilePath, 'utf8')
    : '';
  const { gemHome, bundlerPath, vendorPath, runtime, rubyPath, major } =
    await installBundler(meta, gemfileContents);

  process.env.GEM_HOME = gemHome;

  // Add webrick to Gemfile if it's not included and patch the Gemfile if necessary.
  try {
    debug('preparing Gemfile');
    await prepareGemfile(gemfilePath, major);
    debug('running "bundle lock"');
    await bundleLock(bundlerPath, gemfilePath, rubyPath);
  } catch (err) {
    debug(
      'failed to normalize Gemfile/lockfile before vendor check',
      err as Error
    );
  }

  debug(`Checking existing vendor directory at "${vendorPath}"`);
  const vendorDir = join(workPath, vendorPath);
  const bundleDir = join(workPath, 'vendor', 'bundle');
  const relativeVendorDir = join(entrypointFsDirname, vendorPath);
  const hasRootVendorDir = await pathExists(vendorDir);
  const hasRelativeVendorDir = await pathExists(relativeVendorDir);

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

  // Always run an idempotent frozen install; Bundler will skip already-installed gems.
  // If gems are pre-vendored and already included in the vendor directory, Bundler keeps them when they
  // match the lockfile and platform; otherwise it only installs/replaces what's
  // missing or mismatched (e.g. add webrick or correct platform builds).
  await bundleInstall(bundlerPath, bundleDir, gemfilePath, rubyPath);

  // try to remove gem cache to slim bundle size
  try {
    await remove(join(vendorDir, 'cache'));
  } catch (e) {
    // don't do anything here
  }

  const originalRbPath = join(__dirname, '..', 'vc_init.rb');
  const originalHandlerRbContents = await readFile(originalRbPath, 'utf8');
  const originalUtilsRbPath = join(__dirname, '..', 'vc_utils.rb');
  const originalUtilsRbContents = await readFile(originalUtilsRbPath, 'utf8');

  // will be used on `require_relative '$here'` or for loading rack config.ru file
  // for example, `require_relative 'api/users'`
  debug('entrypoint is', entrypoint);
  const userHandlerFilePath = entrypoint.replace(/\.rb$/, '');
  const nowHandlerRbContents = originalHandlerRbContents.replace(
    /__VC_HANDLER_FILENAME/g,
    userHandlerFilePath
  );

  // in order to allow the user to have `server.rb`, we need our `server.rb` to be called
  // something else
  const handlerRbFilename = 'vc__handler__ruby';
  const utilsRbFilename = 'vc_utils.rb';

  // Apply predefined default excludes similar to Python runtime
  const predefinedExcludes = [
    '.git/**',
    '.gitignore',
    '.vercel/**',
    '.pnpm-store/**',
    '**/node_modules/**',
    '**/.next/**',
    '**/.nuxt/**',
  ];

  const globOptions: GlobOptions = {
    cwd: workPath,
    ignore: predefinedExcludes,
  };

  const outputFiles: Files = await glob('**', globOptions);

  outputFiles[`${handlerRbFilename}.rb`] = new FileBlob({
    data: nowHandlerRbContents,
  });
  outputFiles[utilsRbFilename] = new FileBlob({
    data: originalUtilsRbContents,
  });

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
      if (
        excludedPaths[i] === `${handlerRbFilename}.rb` ||
        excludedPaths[i] === utilsRbFilename
      ) {
        continue;
      }

      // whitelist vendor directory
      if (excludedPaths[i].startsWith(vendorPath)) {
        continue;
      }

      delete outputFiles[excludedPaths[i]];
    }
  }

  const output = new Lambda({
    files: outputFiles,
    handler: `${handlerRbFilename}.vc__handler`,
    runtime,
    environment: {},
  });

  return { output };
};

export { startDevServer } from './start-dev-server';

// Route all requests to the Ruby dev server during `vercel dev`
export const shouldServe: ShouldServe = () => true;
