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

async function bundleInstall(
  bundlePath: string,
  bundleDir: string,
  gemfilePath: string,
  rubyPath: string,
  major: number
) {
  debug(`running "bundle install --deployment --frozen"...`);
  const bundleAppConfig = await getWriteableDirectory();
  const bundlerEnv = cloneEnv(process.env, {
    PATH: `${dirname(rubyPath)}:${dirname(bundlePath)}:${process.env.PATH}`,
    BUNDLE_SILENCE_ROOT_WARNING: '1',
    BUNDLE_APP_CONFIG: bundleAppConfig,
    BUNDLE_JOBS: '4',
  });

  // First, try a strict frozen install to honor the existing lockfile.
  console.log('Running bundle install...');
  let result = await execa(
    bundlePath,
    [
      'install',
      '--deployment',
      '--frozen',
      '--gemfile',
      gemfilePath,
      '--path',
      bundleDir,
    ],
    {
      stdio: 'pipe',
      env: bundlerEnv,
      reject: false,
    }
  );

  if (result.exitCode === 0) {
    // If install succeeded, ensure Ruby 3+ has webrick available.
    if (major >= 3) {
      const currentGemfile = await readFile(gemfilePath, 'utf8');
      const hasWebrick = /^[^#]*\bgem\s+['"]webrick['"]/m.test(currentGemfile);
      if (!hasWebrick) {
        const addRes = await execa(
          bundlePath,
          ['add', 'webrick', '--skip-install'],
          {
            cwd: dirname(gemfilePath),
            stdio: 'pipe',
            env: bundlerEnv,
            reject: false,
          }
        );
        if (addRes.exitCode !== 0) {
          console.log(addRes.stdout);
          console.error(addRes.stderr);
          throw addRes;
        }
        // Update lockfile conservatively for the new gem, then re-run frozen install.
        const lockRes = await execa(
          bundlePath,
          ['lock', '--update', 'webrick'],
          {
            cwd: dirname(gemfilePath),
            stdio: 'pipe',
            env: bundlerEnv,
            reject: false,
          }
        );
        if (lockRes.exitCode !== 0) {
          console.log(lockRes.stdout);
          console.error(lockRes.stderr);
          throw lockRes;
        }
        console.log('Running bundle install...');
        result = await execa(
          bundlePath,
          [
            'install',
            '--deployment',
            '--frozen',
            '--gemfile',
            gemfilePath,
            '--path',
            bundleDir,
          ],
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
    }
    return;
  }

  // Fallback: adjust Gemfile (ruby patch level, add webrick) then re-lock and re-install.
  const originalGemfile = await readFile(gemfilePath, 'utf8');
  let updatedGemfile = originalGemfile;
  let gemfileModified = false;

  if (updatedGemfile.includes('ruby "~> 2.7.x"')) {
    await writeFile(
      gemfilePath,
      updatedGemfile.replace('ruby "~> 2.7.x"', 'ruby "~> 2.7.0"')
    );
    updatedGemfile = await readFile(gemfilePath, 'utf8');
    gemfileModified = true;
  } else if (updatedGemfile.includes('ruby "~> 3.2.x"')) {
    await writeFile(
      gemfilePath,
      updatedGemfile.replace('ruby "~> 3.2.x"', 'ruby "~> 3.2.0"')
    );
    updatedGemfile = await readFile(gemfilePath, 'utf8');
    gemfileModified = true;
  } else if (updatedGemfile.includes('ruby "~> 3.3.x"')) {
    await writeFile(
      gemfilePath,
      updatedGemfile.replace('ruby "~> 3.3.x"', 'ruby "~> 3.3.0"')
    );
    updatedGemfile = await readFile(gemfilePath, 'utf8');
    gemfileModified = true;
  }

  let webrickAdded = false;
  if (major >= 3) {
    const hasWebrick = /^[^#]*\bgem\s+['"]webrick['"]/m.test(updatedGemfile);
    if (!hasWebrick) {
      const addRes = await execa(
        bundlePath,
        ['add', 'webrick', '--skip-install'],
        {
          cwd: dirname(gemfilePath),
          stdio: 'pipe',
          env: bundlerEnv,
          reject: false,
        }
      );
      if (addRes.exitCode !== 0) {
        console.log(addRes.stdout);
        console.error(addRes.stderr);
        throw addRes;
      }
      webrickAdded = true;
      gemfileModified = true;
    } else {
      debug('Gemfile already declares webrick; skipping "bundler add webrick"');
    }
  }

  if (gemfileModified) {
    const lockArgs = webrickAdded ? ['lock', '--update', 'webrick'] : ['lock'];
    const lockResult = await execa(bundlePath, lockArgs, {
      cwd: dirname(gemfilePath),
      stdio: 'pipe',
      env: bundlerEnv,
      reject: false,
    });
    if (lockResult.exitCode !== 0) {
      console.log(lockResult.stdout);
      console.error(lockResult.stderr);
      throw lockResult;
    }
  }

  console.log('Running bundle install...');
  result = await execa(
    bundlePath,
    [
      'install',
      '--deployment',
      '--frozen',
      '--gemfile',
      gemfilePath,
      '--path',
      bundleDir,
    ],
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

async function bundleCheck(
  bundlePath: string,
  bundleDir: string,
  gemfilePath: string,
  rubyPath: string
) {
  debug(`running "bundle check"...`);
  const bundleAppConfig = await getWriteableDirectory();
  const bundlerEnv = cloneEnv(process.env, {
    PATH: `${dirname(rubyPath)}:${dirname(bundlePath)}:${process.env.PATH}`,
    BUNDLE_SILENCE_ROOT_WARNING: '1',
    BUNDLE_APP_CONFIG: bundleAppConfig,
    BUNDLE_JOBS: '4',
  });

  const result = await execa(
    bundlePath,
    ['check', '--gemfile', gemfilePath, '--path', bundleDir],
    {
      stdio: 'pipe',
      env: bundlerEnv,
      reject: false,
    }
  );

  if (result.exitCode !== 0) {
    debug('"bundle check" did not pass; dependencies are missing or outdated');
    return false;
  }
  return true;
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

      // try installing. this won't work if native extensions are required.
      // if that's the case, gems should be vendored locally before deploying.
      await bundleInstall(bundlerPath, bundleDir, gemfilePath, rubyPath, major);
    }
  } else {
    debug(
      'found vendor directory; verifying installed gems with "bundle check"...'
    );
    let isUpToDate = false;
    try {
      isUpToDate = await bundleCheck(
        bundlerPath,
        bundleDir,
        gemfilePath,
        rubyPath
      );
    } catch (err) {
      debug('failed to run "bundle check"', err);
    }
    if (!isUpToDate) {
      debug(
        'running "bundle install --deployment --frozen" to install missing gems...'
      );
      await bundleInstall(bundlerPath, bundleDir, gemfilePath, rubyPath, major);
    } else {
      debug('"bundle check" passed; skipping "bundle install"...');
    }
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
