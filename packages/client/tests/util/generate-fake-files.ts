// Mostly from packages/cli/test/helpers/setup-unit-fixture.ts

import path from 'path';
import fs from 'fs-extra';
// @ts-expect-error Missing types for package
import tmp from 'tmp-promise';
import { afterAll } from 'vitest';

// tmp is supposed to be able to clean up automatically, but this doesn't always work within jest.
// So we attempt to use its built-in cleanup mechanisms, but tests should ideally do their own cleanup too.
tmp.setGracefulCleanup();

export async function generateFakeFiles(totalMB = 100, fileSizeInBytes = 5) {
  const totalFiles = Math.ceil((totalMB * 1024) / fileSizeInBytes);
  const filePaths: string[] = [];
  const tempDir = setupTmpDir();

  const data = 'A'.repeat(fileSizeInBytes);

  for (let i = 1; i <= totalFiles; i++) {
    const fileName = path.join(tempDir, `file_${i}.txt`);
    fs.writeFileSync(fileName, data);
    filePaths.push(fileName);
  }

  return tempDir;
}

let tempRoot: ReturnType<typeof tmp.dirSync> | undefined;
let tempNumber = 0;

export function setupTmpDir() {
  if (!tempRoot) {
    tempRoot = tmp.dirSync({ unsafeCleanup: true }); // clean up even if files are left
  }

  const cwd = path.join(tempRoot.name, String(tempNumber++));
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
