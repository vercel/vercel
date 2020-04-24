import cpy from 'cpy';
import tar from 'tar-fs';
import execa from 'execa';
import { join } from 'path';
import pipe from 'promisepipe';
import { createGzip } from 'zlib';
import {
  createWriteStream,
  mkdirp,
  remove,
  writeJSON,
  writeFile,
} from 'fs-extra';

import { getDistTag } from '../src/util/get-dist-tag';
import pkg from '../package.json';
import { getBundledBuilders } from '../src/util/dev/get-bundled-builders';

const dirRoot = join(__dirname, '..');

async function createBuildersTarball() {
  const distTag = getDistTag(pkg.version);
  const builders = Array.from(getBundledBuilders()).map(b => `${b}@${distTag}`);
  console.log(`Creating builders tarball with: ${builders.join(', ')}`);

  const buildersDir = join(dirRoot, '.builders');
  const assetsDir = join(dirRoot, 'assets');
  await mkdirp(buildersDir);
  await mkdirp(assetsDir);

  const buildersTarballPath = join(assetsDir, 'builders.tar.gz');

  try {
    const buildersPkg = join(buildersDir, 'package.json');
    await writeJSON(buildersPkg, { private: true }, { flag: 'wx' });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }

  await execa(
    'npm',
    ['install', '--save-exact', '--no-package-lock', ...builders],
    {
      cwd: buildersDir,
      stdio: 'inherit',
    }
  );

  const packer = tar.pack(buildersDir);
  await pipe(
    packer,
    createGzip(),
    createWriteStream(buildersTarballPath)
  );
}

async function createConstants() {
  console.log('Creating constants.ts');
  const filename = join(dirRoot, 'src/util/constants.ts');
  const contents = `// This file is auto-generated
export const GA_TRACKING_ID: string | undefined = ${envToString(
    'GA_TRACKING_ID'
  )};
export const SENTRY_DSN: string | undefined =  ${envToString('SENTRY_DSN')};
`;
  await writeFile(filename, contents, 'utf8');
}

function envToString(key: string) {
  const value = process.env[key];
  if (!value) {
    console.log(`- Constant ${key} is not assigned`);
  }
  return JSON.stringify(value);
}

async function main() {
  const isDev = process.argv[2] === '--dev';

  if (!isDev) {
    // Read the secrets from GitHub Actions and generate a file.
    // During local development, these secrets will be empty.
    await createConstants();

    // Create a tarball from all the `@now` scoped builders which will be bundled
    // with Now CLI
    await createBuildersTarball();

    // `now dev` uses chokidar to watch the filesystem, but opts-out of the
    // `fsevents` feature using `useFsEvents: false`, so delete the module here so
    // that it is not compiled by ncc, which makes the npm package size larger
    // than necessary.
    await remove(join(dirRoot, '../../node_modules/fsevents'));

    // Compile the `doT.js` template files for `now dev`
    console.log();
    await execa(process.execPath, [join(__dirname, 'compile-templates.js')], {
      stdio: 'inherit',
    });
  }

  // Do the initial `ncc` build
  console.log();
  const src = join(dirRoot, 'src');
  const args = ['@zeit/ncc', 'build', '--source-map'];
  if (!isDev) {
    args.push('--minify');
  }
  args.push(src);
  await execa('npx', args, { stdio: 'inherit' });

  // `ncc` has some issues with `@zeit/fun`'s runtime files:
  //   - Executable bits on the `bootstrap` files appear to be lost:
  //       https://github.com/zeit/ncc/pull/182
  //   - The `bootstrap.js` asset does not get copied into the output dir:
  //       https://github.com/zeit/ncc/issues/278
  //
  // Aside from those issues, all the same files from the `runtimes` directory
  // should be copied into the output runtimes dir, specifically the `index.js`
  // files (correctly) do not get copied into the output bundle because they
  // get compiled into the final ncc bundle file, however, we want them to be
  // present in the npm package because the contents of those files are involved
  // with `fun`'s cache invalidation mechanism and they need to be shasum'd.
  const runtimes = join(
    dirRoot,
    '../../node_modules/@zeit/fun/dist/src/runtimes'
  );
  const dest = join(dirRoot, 'dist/runtimes');
  await cpy('**/*', dest, { parents: true, cwd: runtimes });

  console.log('Finished building `now-cli`');
}

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', err => {
  console.error('Uncaught Exception:');
  console.error(err);
  process.exit(1);
});

main().catch(err => {
  console.error(err);
  process.exit(1);
});
