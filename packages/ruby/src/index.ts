import { EOL } from 'os';
import { join, dirname } from 'path';
import execa from 'execa';
import {
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
  NowBuildError,
  type Files,
  type BuildV3,
  type GlobOptions,
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

async function detectVendorPlatforms(vendorRoot: string): Promise<string[]> {
  try {
    const rubyPath = join(vendorRoot, 'bundle', 'ruby');
    if (!(await pathExists(rubyPath))) return [];
    const versions = await readdir(rubyPath);
    for (const ver of versions) {
      const extPath = join(rubyPath, ver, 'extensions');
      if (await pathExists(extPath)) {
        try {
          const platforms = await readdir(extPath);
          if (platforms && platforms.length > 0) return platforms;
        } catch (err) {
          debug('ruby: failed to list vendor extension platforms', err);
        }
      }
    }
  } catch (err) {
    debug('ruby: failed to detect vendor platforms', err);
  }
  return [];
}

function isPlatformCompatible(platforms: string[]): boolean {
  if (platforms.length === 0) return true; // no native extensions
  const wantsLinux = process.platform === 'linux';
  const wantsArch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  // Accept any entry that matches both OS and arch tokens
  return platforms.some(p => {
    const lower = p.toLowerCase();
    const osOk = wantsLinux
      ? lower.includes('linux')
      : lower.includes('darwin');
    // Ruby extension directories often use "x86_64" and "arm64" tokens
    const archOk = lower.includes(wantsArch);
    return osOk && archOk;
  });
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
  const fsFiles = await glob('**', workPath);
  debug(`ruby: downloaded files to workPath=${workPath}`);

  // Zero-config entrypoint discovery for Rails
  if (!fsFiles[entrypoint] && config?.framework === 'rails') {
    const candidateDirs = ['', 'src', 'app'];
    const candidates = candidateDirs.map(d =>
      d ? `${d}/config.ru` : 'config.ru'
    );
    const existing = candidates.filter(p => !!fsFiles[p]);
    debug(
      `ruby: rails entrypoint candidates=${JSON.stringify(candidates)} existing=${JSON.stringify(existing)}`
    );
    if (existing.length > 0) {
      debug(
        `ruby: resolved rails entrypoint from=${entrypoint} to=${existing[0]}`
      );
      entrypoint = existing[0];
    } else {
      throw new NowBuildError({
        code: 'RAILS_ENTRYPOINT_NOT_FOUND',
        message: `No Rails entrypoint found. Searched for: ${candidates.join(', ')}`,
      });
    }
  }
  const entrypointFsDirname = join(workPath, dirname(entrypoint));
  const gemfileName = 'Gemfile';

  let gemfilePath = await walkParentDirs({
    base: workPath,
    start: entrypointFsDirname,
    filename: gemfileName,
  });
  debug(`ruby: gemfile detected at path=${gemfilePath || '<none>'}`);

  // Ensure a `Gemfile` exists so that webrick can be installed for Ruby 3.2
  if (!gemfilePath) {
    gemfilePath = join(entrypointFsDirname, gemfileName);
    await writeFile(gemfilePath, `source "https://rubygems.org"${EOL}`);
    debug(`ruby: created default Gemfile at ${gemfilePath}`);
  }

  const gemfileContents = gemfilePath
    ? await readFile(gemfilePath, 'utf8')
    : '';
  debug(`ruby: installing bundler and resolving ruby runtime...`);
  const { gemHome, bundlerPath, vendorPath, runtime, rubyPath, major } =
    await installBundler(meta, gemfileContents);
  debug(
    `ruby: bundler installed, runtime=${runtime} rubyPath=${rubyPath} gemHome=${gemHome}`
  );
  process.env.GEM_HOME = gemHome;
  // Cache vendor gems under .vercel/ruby/<runtime>/<entryDir>
  const entryDirectory = dirname(entrypoint);
  const vendorBaseDir = join(workPath, '.vercel', 'ruby', runtime);
  const scopedVendorBaseDir = join(vendorBaseDir, entryDirectory);
  debug(`ruby: vendor base dir (cache) at ${scopedVendorBaseDir}`);
  debug(`Checking existing vendor directory at "${vendorPath}"`);
  const vendorDir = join(workPath, vendorPath);
  // Install gems into .vercel cache path instead of project root vendor/
  const bundleDir = join(scopedVendorBaseDir, 'vendor', 'bundle');
  const relativeVendorDir = join(entrypointFsDirname, vendorPath);
  let hasRootVendorDir = await pathExists(vendorDir);
  let hasRelativeVendorDir = await pathExists(relativeVendorDir);
  const cachedVendorAbs = join(scopedVendorBaseDir, 'vendor');
  const hasCachedVendorDir = await pathExists(
    join(scopedVendorBaseDir, vendorPath)
  );

  // If a cached vendor exists but targets a different platform/arch, clear it
  if (hasCachedVendorDir) {
    try {
      const platforms = await detectVendorPlatforms(cachedVendorAbs);
      if (!isPlatformCompatible(platforms)) {
        debug(
          `ruby: clearing incompatible cached vendor (platforms=${platforms.join(
            ','
          )}) at ${cachedVendorAbs}`
        );
        await remove(cachedVendorAbs);
      }
    } catch (err) {
      debug('ruby: failed to inspect cached vendor platform', err);
    }
  }

  // If a root vendor exists but targets a different platform/arch, ignore it
  if (hasRootVendorDir) {
    try {
      const platforms = await detectVendorPlatforms(vendorDir);
      if (!isPlatformCompatible(platforms)) {
        debug(
          `ruby: ignoring incompatible root vendor (platforms=${platforms.join(',')}) at ${vendorDir}`
        );
        await remove(vendorDir);
        hasRootVendorDir = false;
      }
    } catch (err) {
      debug('ruby: failed to inspect root vendor platform', err);
    }
  }

  // If a relative vendor exists but targets a different platform/arch, ignore it
  if (hasRelativeVendorDir) {
    try {
      const platforms = await detectVendorPlatforms(relativeVendorDir);
      if (!isPlatformCompatible(platforms)) {
        debug(
          `ruby: ignoring incompatible relative vendor (platforms=${platforms.join(',')}) at ${relativeVendorDir}`
        );
        await remove(relativeVendorDir);
        hasRelativeVendorDir = false;
      }
    } catch (err) {
      debug('ruby: failed to inspect relative vendor platform', err);
    }
  }

  const hasVendorDir =
    hasRootVendorDir || hasRelativeVendorDir || hasCachedVendorDir;

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

  // no vendor directory, check for Gemfile to install
  if (!hasVendorDir) {
    if (gemfilePath) {
      debug(
        'did not find a vendor directory but found a Gemfile, bundling gems...'
      );

      // try installing. this won't work if native extensions are required.
      // if that's the case, gems should be vendored locally before deploying.
      debug(
        `ruby: running bundle install (bundlerPath=${bundlerPath}) to ${bundleDir}`
      );
      await bundleInstall(bundlerPath, bundleDir, gemfilePath, rubyPath, major);
      debug('ruby: bundle install completed');
    }
  } else {
    debug('found vendor directory, skipping "bundle install"...');
  }

  // Try to remove gem cache to slim bundle size (from cached vendor)
  try {
    await remove(join(scopedVendorBaseDir, 'vendor', 'bundle', 'cache'));
    debug('ruby: removed vendor cache directory from cache');
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

  // Apply predefined default excludes similar to Python runtime so we don't
  // accidentally include large/development-only folders (like .vercel) in the Lambda
  const predefinedExcludes = [
    '.git/**',
    '.gitignore',
    '.vercel/**',
    '.pnpm-store/**',
    '**/node_modules/**',
    '**/.next/**',
    '**/.nuxt/**',
    '**/tmp/**',
  ];

  const globOptions: GlobOptions = {
    cwd: workPath,
    ignore: predefinedExcludes,
  };

  const outputFiles: Files = await glob('**', globOptions);
  // Mount cached vendor directory into the Lambda output under vendor/
  try {
    const cachedVendorAbs = join(scopedVendorBaseDir, 'vendor');
    if (await pathExists(cachedVendorAbs)) {
      const vendorFiles = await glob('**', cachedVendorAbs, 'vendor');
      for (const [p, f] of Object.entries(vendorFiles)) {
        outputFiles[p] = f;
      }
      debug('ruby: included cached vendor directory from .vercel into output');
    }
  } catch (err) {
    console.log('Failed to include cached vendor directory');
    throw err;
  }

  outputFiles[`${handlerRbFilename}.rb`] = new FileBlob({
    data: nowHandlerRbContents,
  });
  debug(`ruby: wrote handler file ${handlerRbFilename}.rb`);

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
  debug(
    `ruby: lambda output prepared (files=${Object.keys(outputFiles).length})`
  );

  return { output };
};
