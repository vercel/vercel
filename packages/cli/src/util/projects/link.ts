import fs from 'fs';
import AJV from 'ajv';
import chalk from 'chalk';
import { join, relative } from 'path';
import { ensureDir } from 'fs-extra';
import { promisify } from 'util';

import getProjectByIdOrName from '../projects/get-project-by-id-or-name';
import Client from '../client';
import { InvalidToken, isAPIError, ProjectNotFound } from '../errors-ts';
import getUser from '../get-user';
import getTeamById from '../teams/get-team-by-id';
import type {
  Project,
  ProjectLinkResult,
  Org,
  ProjectLink,
} from '@vercel-internals/types';
import { prependEmoji, emoji, EmojiLabel } from '../emoji';
import { isDirectory } from '../config/global-path';
import { NowBuildError, getPlatformEnv } from '@vercel/build-utils';
import outputCode from '../output/code';
import { isErrnoException, isError } from '@vercel/error-utils';
import { findProjectsFromPath, getRepoLink } from '../link/repo';
import { addToGitIgnore } from '../link/add-to-gitignore';
import type { RepoProjectConfig } from '../link/repo';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

export const VERCEL_DIR = '.vercel';
export const VERCEL_DIR_FALLBACK = '.now';
export const VERCEL_DIR_README = 'README.txt';
export const VERCEL_DIR_PROJECT = 'project.json';
export const VERCEL_DIR_REPO = 'repo.json';

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
 *
 * Throws an error if *both* `.vercel` and `.now` directories exist.
 */
export function getVercelDirectory(cwd: string): string {
  const possibleDirs = [join(cwd, VERCEL_DIR), join(cwd, VERCEL_DIR_FALLBACK)];
  const existingDirs = possibleDirs.filter(d => isDirectory(d));
  if (existingDirs.length > 1) {
    throw new NowBuildError({
      code: 'CONFLICTING_CONFIG_DIRECTORIES',
      message:
        'Both `.vercel` and `.now` directories exist. Please remove the `.now` directory.',
      link: 'https://vercel.link/combining-old-and-new-config',
    });
  }
  return existingDirs[0] || possibleDirs[0];
}

export async function getProjectLink(
  client: Client,
  path: string
): Promise<ProjectLink | null> {
  return (
    (await getProjectLinkFromRepoLink(client, path)) ||
    (await getLinkFromDir(getVercelDirectory(path)))
  );
}

async function getProjectLinkFromRepoLink(
  client: Client,
  path: string
): Promise<ProjectLink | null> {
  const repoLink = await getRepoLink(client, path);
  if (!repoLink?.repoConfig) {
    return null;
  }
  const projects = findProjectsFromPath(
    repoLink.repoConfig.projects,
    relative(repoLink.rootPath, path)
  );
  let project: RepoProjectConfig | undefined;
  if (projects.length === 1) {
    project = projects[0];
  } else {
    const selectableProjects =
      projects.length > 0 ? projects : repoLink.repoConfig.projects;
    const { p } = await client.prompt({
      name: 'p',
      type: 'list',
      message: `Please select a Project:`,
      choices: selectableProjects.map(p => ({
        value: p,
        name: p.name,
      })),
    });
    project = p;
  }
  if (project) {
    return {
      repoRoot: repoLink.rootPath,
      orgId: repoLink.repoConfig.orgId,
      projectId: project.id,
      projectRootDirectory: project.directory,
    };
  }
  return null;
}

export async function getLinkFromDir<T = ProjectLink>(
  dir: string
): Promise<T | null> {
  try {
    const json = await readFile(join(dir, VERCEL_DIR_PROJECT), 'utf8');

    const ajv = new AJV();
    const link: T = JSON.parse(json);

    if (!ajv.validate(linkSchema, link)) {
      throw new Error(
        `Project Settings are invalid. To link your project again, remove the ${dir} directory.`
      );
    }

    return link;
  } catch (err: unknown) {
    // link file does not exists, project is not linked
    if (
      isErrnoException(err) &&
      err.code &&
      ['ENOENT', 'ENOTDIR'].includes(err.code)
    ) {
      return null;
    }

    // link file can't be read
    if (isError(err) && err.name === 'SyntaxError') {
      throw new Error(
        `Project Settings could not be retrieved. To link your project again, remove the ${dir} directory.`
      );
    }

    throw err;
  }
}

async function getOrgById(client: Client, orgId: string): Promise<Org | null> {
  if (orgId.startsWith('team_')) {
    const team = await getTeamById(client, orgId);
    if (!team) return null;
    return { type: 'team', id: team.id, slug: team.slug };
  }

  const user = await getUser(client);
  if (user.id !== orgId) return null;
  return { type: 'user', id: orgId, slug: user.username };
}

async function hasProjectLink(
  client: Client,
  projectLink: ProjectLink,
  path: string
): Promise<boolean> {
  // "linked" via env vars?
  const VERCEL_ORG_ID = getPlatformEnv('ORG_ID');
  const VERCEL_PROJECT_ID = getPlatformEnv('PROJECT_ID');
  if (
    VERCEL_ORG_ID === projectLink.orgId &&
    VERCEL_PROJECT_ID === projectLink.projectId
  ) {
    return true;
  }

  // linked via `repo.json`?
  const repoLink = await getRepoLink(client, path);
  if (
    repoLink?.repoConfig?.orgId === projectLink.orgId &&
    repoLink.repoConfig.projects.find(p => p.id === projectLink.projectId)
  ) {
    return true;
  }

  // if the project is already linked, we skip linking
  const link = await getLinkFromDir(getVercelDirectory(path));
  if (
    link &&
    link.orgId === projectLink.orgId &&
    link.projectId === projectLink.projectId
  ) {
    return true;
  }

  return false;
}

export async function getLinkedProject(
  client: Client,
  path = client.cwd
): Promise<ProjectLinkResult> {
  const { output } = client;
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
      : await getProjectLink(client, path);

  if (!link) {
    return { status: 'not_linked', org: null, project: null };
  }

  output.spinner('Retrieving project…', 1000);
  let org: Org | null = null;
  let project: Project | ProjectNotFound | null = null;
  try {
    [org, project] = await Promise.all([
      getOrgById(client, link.orgId),
      getProjectByIdOrName(client, link.projectId, link.orgId),
    ]);
  } catch (err: unknown) {
    if (isAPIError(err) && err.status === 403) {
      output.stopSpinner();

      if (err.missingToken || err.invalidToken) {
        throw new InvalidToken();
      } else {
        throw new NowBuildError({
          message: `Could not retrieve Project Settings. To link your Project, remove the ${outputCode(
            VERCEL_DIR
          )} directory and deploy again.`,
          code: 'PROJECT_UNAUTHORIZED',
          link: 'https://vercel.link/cannot-load-project-settings',
        });
      }
    }

    // Not a special case 403, we should still throw it
    throw err;
  } finally {
    output.stopSpinner();
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
    }

    output.print(
      prependEmoji(
        'Your Project was either deleted, transferred to a new Team, or you don’t have access to it anymore.\n',
        emoji('warning')
      )
    );
    return { status: 'not_linked', org: null, project: null };
  }

  return { status: 'linked', org, project, repoRoot: link.repoRoot };
}

export async function writeReadme(path: string) {
  await writeFile(
    join(path, VERCEL_DIR, VERCEL_DIR_README),
    await readFile(join(__dirname, 'VERCEL_DIR_README.txt'), 'utf8')
  );
}

export async function linkFolderToProject(
  client: Client,
  path: string,
  projectLink: ProjectLink,
  projectName: string,
  orgSlug: string,
  successEmoji: EmojiLabel = 'link'
) {
  // if the project is already linked, we skip linking
  if (await hasProjectLink(client, projectLink, path)) {
    return;
  }

  try {
    await ensureDir(join(path, VERCEL_DIR));
  } catch (err: unknown) {
    if (isErrnoException(err) && err.code === 'ENOTDIR') {
      // folder couldn't be created because
      // we're deploying a static file
      return;
    }
    throw err;
  }

  await writeFile(
    join(path, VERCEL_DIR, VERCEL_DIR_PROJECT),
    JSON.stringify(projectLink)
  );

  await writeReadme(path);

  // update .gitignore
  const isGitIgnoreUpdated = await addToGitIgnore(path);

  client.output.print(
    prependEmoji(
      `Linked to ${chalk.bold(
        `${orgSlug}/${projectName}`
      )} (created ${VERCEL_DIR}${
        isGitIgnoreUpdated ? ' and added it to .gitignore' : ''
      })`,
      emoji(successEmoji)
    ) + '\n'
  );
}
