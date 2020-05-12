import { join } from 'path';
import fs from 'fs';
import { ensureDir } from 'fs-extra';
import { promisify } from 'util';
import getProjectByIdOrName from '../projects/get-project-by-id-or-name';
import Client from '../client';
import { ProjectNotFound } from '../errors-ts';
import getUser from '../get-user';
import getTeamById from '../get-team-by-id';
import { Output } from '../output';
import { Project } from '../../types';
import { Org, ProjectLink } from '../../types';
import chalk from 'chalk';
import { prependEmoji, emoji } from '../emoji';
import AJV from 'ajv';
import { isDirectory } from '../config/global-path';
import { getPlatformEnv } from '@vercel/build-utils';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

export const VERCEL_DIR = '.vercel';
export const VERCEL_DIR_FALLBACK = '.now';
export const VERCEL_DIR_README = 'README.txt';
export const VERCEL_DIR_PROJECT = 'project.json';

const linkSchema = {
  type: 'object',
  required: ['projectId', 'orgId'],
  properties: {
    projectId: {
      type: 'string',
      minLength: 1,
    },
    orgId: {
      type: 'string',
      minLength: 1,
    },
  },
};

/**
 * Returns the `<cwd>/.vercel` directory for the current project
 * with a fallback to <cwd>/.now` if it exists.
 */
export function getVercelDirectory(cwd: string = process.cwd()) {
  const possibleDirs = [join(cwd, VERCEL_DIR), join(cwd, VERCEL_DIR_FALLBACK)];
  return possibleDirs.find(d => isDirectory(d)) || possibleDirs[0];
}

async function getLink(path?: string): Promise<ProjectLink | null> {
  const dir = getVercelDirectory(path);
  return getLinkFromDir(dir);
}

async function getLinkFromDir(dir: string): Promise<ProjectLink | null> {
  try {
    const json = await readFile(join(dir, VERCEL_DIR_PROJECT), 'utf8');

    const ajv = new AJV();
    const link: ProjectLink = JSON.parse(json);

    if (!ajv.validate(linkSchema, link)) {
      throw new Error(
        `Project settings are invalid. To link your project again, remove the ${dir} directory.`
      );
    }

    return link;
  } catch (error) {
    // link file does not exists, project is not linked
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) {
      return null;
    }

    // link file can't be read
    if (error.name === 'SyntaxError') {
      throw new Error(
        `Project settings could not be retrieved. To link your project again, remove the ${dir} directory.`
      );
    }

    throw error;
  }
}

async function getOrgById(client: Client, orgId: string): Promise<Org | null> {
  if (orgId.startsWith('team_')) {
    const team = await getTeamById(client, orgId);
    if (!team) return null;
    return { type: 'team', id: team.id, slug: team.slug };
  }

  const user = await getUser(client);
  if (user.uid !== orgId) return null;
  return { type: 'user', id: orgId, slug: user.username };
}

export async function getLinkedProject(
  output: Output,
  client: Client,
  path?: string
): Promise<
  | { status: 'linked'; org: Org; project: Project }
  | { status: 'not_linked'; org: null; project: null }
  | { status: 'error'; exitCode: number }
> {
  const VERCEL_ORG_ID = getPlatformEnv('ORG_ID');
  const VERCEL_PROJECT_ID = getPlatformEnv('PROJECT_ID');
  const shouldUseEnv = Boolean(VERCEL_ORG_ID && VERCEL_PROJECT_ID);

  if ((VERCEL_ORG_ID || VERCEL_PROJECT_ID) && !shouldUseEnv) {
    output.error(
      `You specified ${
        VERCEL_ORG_ID ? '`VERCEL_ORG_ID`' : '`VERCEL_PROJECT_ID`'
      } but you forgot to specify ${
        VERCEL_ORG_ID ? '`VERCEL_PROJECT_ID`' : '`VERCEL_ORG_ID`'
      }. You need to specify both to deploy to a custom project.\n`
    );
    return { status: 'error', exitCode: 1 };
  }

  const link =
    VERCEL_ORG_ID && VERCEL_PROJECT_ID
      ? { orgId: VERCEL_ORG_ID, projectId: VERCEL_PROJECT_ID }
      : await getLink(path);

  if (!link) {
    return { status: 'not_linked', org: null, project: null };
  }

  const spinner = output.spinner('Retrieving project…', 1000);
  let org: Org | null;
  let project: Project | ProjectNotFound | null;
  try {
    [org, project] = await Promise.all([
      getOrgById(client, link.orgId),
      getProjectByIdOrName(client, link.projectId, link.orgId),
    ]);
  } finally {
    spinner();
  }

  if (!org || !project || project instanceof ProjectNotFound) {
    if (shouldUseEnv) {
      output.error(
        `Project not found (${JSON.stringify({
          VERCEL_PROJECT_ID,
          VERCEL_ORG_ID,
        })})\n`
      );
      return { status: 'error', exitCode: 1 };
    } else {
      output.print(
        prependEmoji(
          'Your project was either removed from Vercel or you’re not a member of it anymore.\n',
          emoji('warning')
        )
      );
    }

    return { status: 'not_linked', org: null, project: null };
  }

  return { status: 'linked', org, project };
}

export async function linkFolderToProject(
  output: Output,
  path: string,
  projectLink: ProjectLink,
  projectName: string,
  orgSlug: string
) {
  const VERCEL_ORG_ID = getPlatformEnv('ORG_ID');
  const VERCEL_PROJECT_ID = getPlatformEnv('PROJECT_ID');

  // if defined, skip linking
  if (VERCEL_ORG_ID || VERCEL_PROJECT_ID) {
    return;
  }

  // if the project is already linked, we skip linking
  const link = await getLink(path);
  if (
    link &&
    link.orgId === projectLink.orgId &&
    link.projectId === projectLink.projectId
  ) {
    return;
  }

  try {
    await ensureDir(join(path, VERCEL_DIR));
  } catch (error) {
    if (error.code === 'ENOTDIR') {
      // folder couldn't be created because
      // we're deploying a static file
      return;
    }
    throw error;
  }

  await writeFile(
    join(path, VERCEL_DIR, VERCEL_DIR_PROJECT),
    JSON.stringify(projectLink),
    { encoding: 'utf8' }
  );

  await writeFile(
    join(path, VERCEL_DIR, VERCEL_DIR_README),
    await readFile(join(__dirname, 'VERCEL_DIR_README.txt'), 'utf-8'),
    { encoding: 'utf-8' }
  );

  // update .gitignore
  let isGitIgnoreUpdated = false;
  try {
    const gitIgnorePath = join(path, '.gitignore');

    const gitIgnore = await readFile(gitIgnorePath)
      .then(buf => buf.toString())
      .catch(() => null);

    if (!gitIgnore || !gitIgnore.split('\n').includes(VERCEL_DIR)) {
      await writeFile(
        gitIgnorePath,
        gitIgnore ? `${gitIgnore}\n${VERCEL_DIR}` : VERCEL_DIR
      );
      isGitIgnoreUpdated = true;
    }
  } catch (error) {
    // ignore errors since this is non-critical
  }

  output.print(
    prependEmoji(
      `Linked to ${chalk.bold(
        `${orgSlug}/${projectName}`
      )} (created ${VERCEL_DIR}${
        isGitIgnoreUpdated ? ' and added it to .gitignore' : ''
      })`,
      emoji('link')
    ) + '\n'
  );
}
