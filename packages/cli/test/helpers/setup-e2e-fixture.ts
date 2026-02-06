import fs from 'fs-extra';
import path from 'path';
import getGlobalDir from './get-global-dir';
import prepareFixtures from './prepare';

function getTmpFixturesDir() {
  return path.join(getGlobalDir(), 'tmp-fixtures');
}

export async function setupE2EFixture(name: string) {
  const directory = path.join(getTmpFixturesDir(), name);
  const config = path.join(directory, 'project.json');

  // We need to remove it, otherwise we can't re-use fixtures
  if (fs.existsSync(config)) {
    fs.unlinkSync(config);
  }

  return directory;
}

export async function prepareE2EFixtures(
  contextName: string,
  binaryPath: string
) {
  await prepareFixtures(contextName, binaryPath, getTmpFixturesDir());
}
