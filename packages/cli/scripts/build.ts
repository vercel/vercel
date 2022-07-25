import cpy from 'cpy';
import execa from 'execa';
import { join } from 'path';
import { remove, writeFile } from 'fs-extra';

const dirRoot = join(__dirname, '..');
const distRoot = join(dirRoot, 'dist');

async function createConstants() {
  console.log('Creating constants.ts');
  const filename = join(dirRoot, 'src/util/constants.ts');
  const contents = `// This file is auto-generated
export const GA_TRACKING_ID: string | undefined = ${envToString(
    'GA_TRACKING_ID'
  )};
export const SENTRY_DSN: string | undefined = ${envToString('SENTRY_DSN')};
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
  // Read the secrets from GitHub Actions and generate a file.
  // During local development, these secrets will be empty.
  await createConstants();

  // `vercel dev` uses chokidar to watch the filesystem, but opts-out of the
  // `fsevents` feature using `useFsEvents: false`, so delete the module here so
  // that it is not compiled by ncc, which makes the npm package size larger
  // than necessary.
  await remove(join(dirRoot, '../../node_modules/fsevents'));

  // Compile the `doT.js` template files for `vercel dev`
  console.log();
  await execa(process.execPath, [join(__dirname, 'compile-templates.js')], {
    stdio: 'inherit',
  });

  // Do the initial `ncc` build
  console.log();
  const args = [
    'ncc',
    'build',
    '--external',
    'update-notifier',
    'src/index.ts',
  ];
  await execa('yarn', args, { stdio: 'inherit', cwd: dirRoot });

  // `ncc` has some issues with `@vercel/fun`'s runtime files:
  //   - Executable bits on the `bootstrap` files appear to be lost:
  //       https://github.com/vercel/ncc/pull/182
  //   - The `bootstrap.js` asset does not get copied into the output dir:
  //       https://github.com/vercel/ncc/issues/278
  //
  // Aside from those issues, all the same files from the `runtimes` directory
  // should be copied into the output runtimes dir, specifically the `index.js`
  // files (correctly) do not get copied into the output bundle because they
  // get compiled into the final ncc bundle file, however, we want them to be
  // present in the npm package because the contents of those files are involved
  // with `fun`'s cache invalidation mechanism and they need to be shasum'd.
  const runtimes = join(
    dirRoot,
    '../../node_modules/@vercel/fun/dist/src/runtimes'
  );
  await cpy('**/*', join(distRoot, 'runtimes'), {
    parents: true,
    cwd: runtimes,
  });

  // Band-aid to bundle stuff that `ncc` neglects to bundle
  await cpy(join(dirRoot, 'src/util/projects/VERCEL_DIR_README.txt'), distRoot);
  await cpy(join(dirRoot, 'src/util/dev/builder-worker.js'), distRoot);

  console.log('Finished building Vercel CLI');
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
