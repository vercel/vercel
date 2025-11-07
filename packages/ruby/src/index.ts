import { EOL } from 'os';
import { join, dirname } from 'path';
import execa from 'execa';
import {
  ensureDir,
  move,
  remove,
  pathExists,
  readFile,
  writeFile,
  readdir,
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

async function hasBundledGems(dir: string): Promise<boolean> {
  try {
    const specs = await readdir(join(dir, 'specifications'));
    if (specs && specs.length > 0) return true;
  } catch (e) {
    debug('ruby: failed to read specifications directory', e);
  }
  try {
    const gems = await readdir(join(dir, 'gems'));
    return Boolean(gems && gems.length > 0);
  } catch (e) {
    debug('ruby: failed to read gems directory', e);
  }
  return false;
}

async function bundleInstall(
  bundlePath: string,
  bundleDir: string,
  gemfilePath: string,
  rubyPath: string,
  major: number
) {
  debug(`running "bundle install --deployment"...`);
  const bundleAppConfig = await getWriteableDirectory();
  const gemfileContent = await readFile(gemfilePath, 'utf8');

  if (gemfileContent.includes('ruby "~> 2.7.x"')) {
    // Gemfile contains "2.7.x" which will cause an error message:
    // "Your Ruby patchlevel is 0, but your Gemfile specified -1"
    // See https://github.com/rubygems/bundler/blob/3f0638c6c8d340c2f2405ecb84eb3b39c433e36e/lib/bundler/errors.rb#L49
    // We must correct to the actual version in the build container.
    await writeFile(
      gemfilePath,
      gemfileContent.replace('ruby "~> 2.7.x"', 'ruby "~> 2.7.0"')
    );
  } else if (gemfileContent.includes('ruby "~> 3.2.x"')) {
    // Gemfile contains "3.2.x" which will cause an error message:
    // "Your Ruby patchlevel is 0, but your Gemfile specified -1"
    // See https://github.com/rubygems/bundler/blob/3f0638c6c8d340c2f2405ecb84eb3b39c433e36e/lib/bundler/errors.rb#L49
    // We must correct to the actual version in the build container.
    await writeFile(
      gemfilePath,
      gemfileContent.replace('ruby "~> 3.2.x"', 'ruby "~> 3.2.0"')
    );
  } else if (gemfileContent.includes('ruby "~> 3.3.x"')) {
    // Gemfile contains "3.3.x" which will cause an error message:
    // "Your Ruby patchlevel is 0, but your Gemfile specified -1"
    // See https://github.com/rubygems/bundler/blob/3f0638c6c8d340c2f2405ecb84eb3b39c433e36e/lib/bundler/errors.rb#L49
    // We must correct to the actual version in the build container.
    await writeFile(
      gemfilePath,
      gemfileContent.replace('ruby "~> 3.3.x"', 'ruby "~> 3.3.0"')
    );
  }

  const bundlerEnv = cloneEnv(process.env, {
    // Ensure the correct version of `ruby` is in front of the $PATH
    PATH: `${dirname(rubyPath)}:${dirname(bundlePath)}:${process.env.PATH}`,
    BUNDLE_SILENCE_ROOT_WARNING: '1',
    BUNDLE_APP_CONFIG: bundleAppConfig,
    BUNDLE_JOBS: '4',
  });

  // Ensure Gemfile.lock contains the correct target platform for the current build env
  // so Bundler resolves native gems for the Lambda runtime architecture.
  try {
    if (process.platform === 'linux') {
      const archToken = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
      const platform = `${archToken}-linux`;
      debug(`ruby: ensuring Gemfile.lock has platform ${platform}`);
      await execa('bundler', ['lock', '--add-platform', platform], {
        cwd: dirname(gemfilePath),
        stdio: 'pipe',
        env: bundlerEnv,
        reject: false,
      });
    }
  } catch (err) {
    debug('ruby: failed to add platform to Gemfile.lock (non-fatal)', err);
  }

  // "webrick" needs to be installed for Ruby 3+ to fix runtime error:
  // webrick is not part of the default gems since Ruby 3.0.0. Install webrick from RubyGems.
  if (major >= 3) {
    const hasWebrick = /(?:^|\n)\s*(?!#)\s*gem\s+["']webrick["']/m.test(
      gemfileContent
    );
    const injectedPath = join(dirname(gemfilePath), 'injected gems');
    let hasInjectedWebrick = false;
    try {
      if (await pathExists(injectedPath)) {
        const injected = await readFile(injectedPath, 'utf8');
        hasInjectedWebrick = /(?:^|\n)\s*(?!#)\s*gem\s+["']webrick["']/.test(
          injected
        );
        // If Gemfile already includes webrick, ensure stale Bundler "injected gems" file
        // does not re-inject a conflicting version requirement.
        if (hasWebrick && hasInjectedWebrick) {
          const filtered = injected
            .split(/\r?\n/)
            .filter(line => !/^\s*gem\s+["']webrick["']/.test(line))
            .join('\n')
            .trim();
          if (filtered.length === 0) {
            await remove(injectedPath);
            debug('ruby: removed stale "injected gems" file');
          } else if (filtered !== injected.trim()) {
            await writeFile(injectedPath, filtered + '\n');
            debug('ruby: filtered webrick from "injected gems" file');
          }
          hasInjectedWebrick = false;
        }
      }
    } catch (err) {
      debug('ruby: failed to process "injected gems" file', err);
    }

    if (!hasWebrick && !hasInjectedWebrick) {
      console.log('Installing required gems...');
      const result = await execa('bundler', ['add', 'webrick'], {
        cwd: dirname(gemfilePath),
        stdio: 'pipe',
        env: bundlerEnv,
        reject: false,
      });
      if (result.exitCode !== 0) {
        console.log(result.stdout);
        console.error(result.stderr);
        throw result;
      }
    } else {
      debug(
        `ruby: skipping bundler add for webrick (Gemfile=${hasWebrick}, injected=${hasInjectedWebrick})`
      );
    }
  }

  console.log('Running bundle install...');
  const result = await execa(
    bundlePath,
    ['install', '--deployment', '--gemfile', gemfilePath, '--path', bundleDir],
    {
      stdio: 'pipe',
      env: bundlerEnv,
      reject: false,
    }
  );
  if (result.exitCode !== 0) {
    console.log(result.stdout);
    console.error(result.stderr);
    throw result;
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
  debug(`Checking existing vendor directory at "${vendorPath}"`);
  const vendorDir = join(workPath, vendorPath);
  const bundleDir = join(workPath, 'vendor', 'bundle');
  const relativeVendorDir = join(entrypointFsDirname, vendorPath);
  const rootVendorExists = await pathExists(vendorDir);
  const relativeVendorExists = await pathExists(relativeVendorDir);
  const hasRootVendorDir =
    rootVendorExists && (await hasBundledGems(vendorDir));
  const hasRelativeVendorDir =
    relativeVendorExists && (await hasBundledGems(relativeVendorDir));
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

      // try installing. this won't work if native extensions are required.
      // if that's the case, gems should be vendored locally before deploying.
      await bundleInstall(bundlerPath, bundleDir, gemfilePath, rubyPath, major);
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
  // something else
  const handlerRbFilename = 'vc__handler__ruby';

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

  const output = new Lambda({
    files: outputFiles,
    handler: `${handlerRbFilename}.vc__handler`,
    runtime,
    environment: {},
  });

  return { output };
};
