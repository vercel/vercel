import findUp from 'find-up';
import fs from 'fs-extra';
import path from 'path';
// @ts-ignore
import tmp from 'tmp-promise';

// tmp is supposed to be able to clean up automatically, but this doesn't always work within jest.
// So we attempt to use its built-in cleanup mechanisms, but tests should ideally do their own cleanup too.
tmp.setGracefulCleanup();

let fixturesRoot: string | undefined;
let tempRoot: tmp.DirResult | undefined;
let tempNumber = 0;

/**
 * Create a temp directory containing the given fixture name in a git repo.
 * Be sure to call `cleanupFixtures()` after all tests to clean up temp directories.
 */
export function setupUnitFixture(fixtureName: string) {
  if (!fixturesRoot) {
    fixturesRoot = findUp.sync('fixtures', {
      cwd: __dirname,
      type: 'directory',
    });
  }

  const fixturePath = path.join(fixturesRoot!, 'unit', fixtureName);
  if (!fs.existsSync(fixturePath)) {
    throw new Error(
      `Couldn't find fixture "${fixtureName}" under "${path.join(
        fixturesRoot!,
        'unit'
      )}"`
    );
  }

  const cwd = setupTmpDir(fixtureName);
  fs.copySync(fixturePath, cwd);
  return cwd;
}

export function setupTmpDir(fixtureName?: string) {
  if (!tempRoot) {
    // Create a shared root temp directory for fixture files
    tempRoot = tmp.dirSync({ unsafeCleanup: true }); // clean up even if files are left
  }

  const cwd = path.join(tempRoot.name, String(tempNumber++), fixtureName ?? '');
  fs.mkdirpSync(cwd);
  return fs.realpathSync(cwd);
}

export function cleanupFixtures() {
  if (tempRoot) {
    tempRoot.removeCallback();
    tempRoot = undefined;
  }
}

// After all tests are run, we clean up our fixtures
afterAll(() => {
  cleanupFixtures();
});
