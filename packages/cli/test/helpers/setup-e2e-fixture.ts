import path from 'path';
import fs from 'fs-extra';
import prepareFixtures from './prepare';
import getGlobalDir from './get-global-dir';

function getTmpFixturesDir() {
  return path.join(getGlobalDir(), 'tmp-fixtures');
}

export async function setupE2EFixture(
  name: string,
  opts: { removeProjectLink?: boolean } = {}
) {
  const directory = path.join(getTmpFixturesDir(), name);
  const config = path.join(directory, 'project.json');

  // We need to remove it, otherwise we can't re-use fixtures
  if (fs.existsSync(config)) {
    fs.unlinkSync(config);
  }

  // Deploys from a previous (retried CI) run leave a project link behind,
  // which would make the CLI reuse the old session's project instead of
  // creating one for the current session. Opt-in because some fixtures
  // intentionally ship their own `.vercel/project.json`.
  if (opts.removeProjectLink) {
    const linkConfig = path.join(directory, '.vercel', 'project.json');
    if (fs.existsSync(linkConfig)) {
      fs.unlinkSync(linkConfig);
    }
  }

  return directory;
}

export async function prepareE2EFixtures(
  contextName: string,
  binaryPath: string
) {
  await prepareFixtures(contextName, binaryPath, getTmpFixturesDir());
}
