const cpy = require('cpy');
const tar = require('tar-fs');
const execa = require('execa');
const { join } = require('path');
const pipe = require('promisepipe');
const { createGzip } = require('zlib');
const {
  createReadStream,
  createWriteStream,
  mkdirp,
  remove,
  writeFile,
  writeJSON
} = require('fs-extra');
const pkg = require('../package.json');

const dirRoot = join(__dirname, '..');

async function createBuildersTarball() {
  const builders = Object.keys(pkg.devDependencies)
    .filter(d => d.startsWith('@now/'))
    .map(d => `${d}@${pkg.devDependencies[d]}`);
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

  const yarn = join(dirRoot, 'node_modules/yarn/bin/yarn.js');
  await execa(
    process.execPath,
    [ yarn, 'add', '--no-lockfile', ...builders ],
    { cwd: buildersDir, stdio: 'inherit' }
  );

  const packer = tar.pack(buildersDir);
  await pipe(packer, createGzip(), createWriteStream(buildersTarballPath));
}

async function main() {
  const isDev = process.argv[2] === '--dev';

  // Create a tarball from all the `@now` scoped builders which will be bundled
  // with Now CLI
  await createBuildersTarball();

  // `now dev` uses chokidar to watch the filesystem, but opts-out of the
  // `fsevents` feature using `useFsEvents: false`, so delete the module here so
  // that it is not compiled by ncc, which makes the npm package size larger
  // than necessary.
  await remove(join(dirRoot, 'node_modules/fsevents'));

  // Do the initial `ncc` build
  const src = join(dirRoot, 'src');
  const ncc = join(dirRoot, 'node_modules/@zeit/ncc/dist/ncc/cli.js');
  const args = [ ncc, 'build', '--source-map' ];
  if (!isDev) {
    args.push('--minify');
  }
  args.push(src);
  await execa(process.execPath, args, { stdio: 'inherit' });

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
  const runtimes = join(dirRoot, 'node_modules/@zeit/fun/dist/src/runtimes');
  const dest = join(dirRoot, 'dist/runtimes');
  await cpy('**/*', dest, { parents: true, cwd: runtimes });

  console.log('Finished building `now-cli`');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
