import path from 'path';
import fs from 'fs';
import { ensureDir } from 'fs-extra';
import { promisify } from 'util';
import getProjectByIdOrName from '../projects/get-project-by-id-or-name';
import Client from '../client';
import { ProjectNotFound } from '../errors-ts';
import getUser from '../get-user';
import getTeamById from '../get-team-by-id';
import { Output } from '../output';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

export const NOW_FOLDER = '.now';
export const NOW_PROJECT_LINK_FILE = 'project.json';

interface ProjectFolderLink {
  projectId: string;
  orgId: string;
}

export async function getLinkedProject(client: Client) {
  const cwd = process.cwd();

  try {
    const json = await readFile(
      path.join(cwd, NOW_FOLDER, NOW_PROJECT_LINK_FILE),
      { encoding: 'utf8' }
    );

    const link: ProjectFolderLink = JSON.parse(json);

    const [orgName, project] = await Promise.all([
      link.orgId.startsWith('team_')
        ? getTeamById(client, link.orgId).then(t => (t ? t.slug : null))
        : getUser(client).then(user => user.username),
      getProjectByIdOrName(client, link.projectId, link.orgId),
    ]);

    if (project instanceof ProjectNotFound || orgName === null) {
      return null;
    }

    return [orgName, project];
  } catch (error) {
    // link file does not exists, project is not linked
    if (error.code === 'ENOENT') {
      return null;
    }

    // link file can't be read
    if (error.name === 'SyntaxError') {
      throw new Error(
        'Now project settings could not be retrieved. To link your project again, remove .now'
      );
    }

    throw error;
  }
}

export async function linkFolderToProject(
  output: Output,
  projectFolderLink: ProjectFolderLink
) {
  const cwd = process.cwd();

  await ensureDir(path.join(cwd, NOW_FOLDER));

  await writeFile(
    path.join(cwd, NOW_FOLDER, NOW_PROJECT_LINK_FILE),
    JSON.stringify(projectFolderLink),
    {
      encoding: 'utf8',
    }
  );

  // update .nowignore
  try {
    const gitIgnorePath = path.join(cwd, '.gitignore');
    const gitIgnore = (await readFile(gitIgnorePath)).toString();
    if (gitIgnore.split('\n').indexOf('.now') < 0) {
      await writeFile(gitIgnorePath, gitIgnore + '\n.now');
    }
  } catch (error) {
    // ignore errors since this is non-critical
  }

  output.print(`✅ Linked (created .now and added it to .nowignore)`);
}
