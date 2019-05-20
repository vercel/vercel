const cpy = require('cpy');
const execa = require('execa');
const { join } = require('path');
const { remove } = require('fs-extra');

async function main() {
  const isDev = process.argv[2] === '--dev';

  // `now dev` uses chokidar to watch the filesystem, but opts-out of the
  // `fsevents` feature using `useFsEvents: false`, so delete the module here so
  // that it is not compiled by ncc, which makes the pkg'd binary size larger
  // than necessary.
  await remove(join(__dirname, 'node_modules/fsevents'));

  // Do the initial `ncc` build
  const src = join(__dirname, 'src');
  const ncc = join(__dirname, 'node_modules/@zeit/ncc/dist/ncc/cli.js');
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
  // present on pkg's snapshot fs because the contents of those files are involved
  // with `fun`'s cache invalidation mechanism and they need to be shasum'd.
  const runtimes = join(__dirname, 'node_modules/@zeit/fun/dist/src/runtimes');
  const dest = join(__dirname, 'dist/runtimes');
  await cpy('**/*', dest, { parents: true, cwd: runtimes });

  console.log('Finished building `now-cli`');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
