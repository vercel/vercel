import { join } from 'path';
import { outputJSON, readJSON, remove } from 'fs-extra';
import ms from 'ms';
import { getPlatformEnv } from '@vercel/build-utils';
import { errorToString } from '@vercel/error-utils';
import type { Project, ProjectLinked } from '@vercel-internals/types';
import type Client from '../client';
import output from '../../output-manager';
import param from '../output/param';
import { getCommandName } from '../pkg-name';
import {
  getLinkFromDir,
  getVercelDirectory,
  VERCEL_DIR,
} from '../projects/link';
import { getRepoLink } from '../link/repo';
import { addToGitIgnore } from '../link/add-to-gitignore';

export const VERCEL_DIR_ANONYMOUS = 'anonymous.json';

export interface AnonymousState {
  projectId: string;
  token: string;
  expiresAt: number;
}

function anonymousStatePath(cwd: string) {
  return join(cwd, VERCEL_DIR, VERCEL_DIR_ANONYMOUS);
}

export async function readAnonymousState(
  cwd: string
): Promise<AnonymousState | null> {
  try {
    const state = await readJSON(anonymousStatePath(cwd));
    if (
      typeof state?.projectId === 'string' &&
      typeof state.token === 'string' &&
      typeof state.expiresAt === 'number'
    ) {
      return state;
    }
  } catch (_error) {}
  return null;
}

export async function writeAnonymousState(cwd: string, state: AnonymousState) {
  await outputJSON(anonymousStatePath(cwd), state, { spaces: 2 });
  await addToGitIgnore(cwd);
}

export async function clearAnonymousState(cwd: string) {
  await remove(anonymousStatePath(cwd));
}

export async function bootstrapAnonymousProject(
  client: Client
): Promise<AnonymousState> {
  const { projectId, token, expiresAt } = await client.fetch<AnonymousState>(
    '/v1/anonymous/projects',
    {
      method: 'POST',
      body: {},
      useCurrentTeam: false,
      // Not idempotent: each attempt creates a project server-side.
      retry: { retries: 0 },
    }
  );
  return { projectId, token, expiresAt };
}

export type AnonymousLink = ProjectLinked & {
  anonymous: true;
  expiresAt: number;
};

export async function ensureAnonymousLink(
  client: Client,
  cwd: string,
  { requireExistingState = false } = {}
): Promise<AnonymousLink | 'failed' | 'refused'> {
  const linked =
    Boolean(getPlatformEnv('ORG_ID') && getPlatformEnv('PROJECT_ID')) ||
    Boolean(await getLinkFromDir(getVercelDirectory(cwd))) ||
    Boolean((await getRepoLink(client, cwd))?.repoConfig);
  if (linked) {
    output.prettyError({
      message: `This directory is linked to an existing Vercel project, but no credentials were found. Run ${getCommandName('login')}, pass ${param('--token')}, or remove the .vercel directory to deploy anonymously.`,
    });
    return 'failed';
  }

  let state = await readAnonymousState(cwd);
  if (state && state.expiresAt <= Date.now()) {
    output.prettyError({
      message: `Your anonymous deployment has expired. Create an account to keep deploying this app by running ${getCommandName('login')}.`,
    });
    return 'failed';
  }
  if (!state && requireExistingState) {
    output.error(
      `The ${param('--dry')} option requires an existing anonymous deployment. Run ${getCommandName('deploy')} first, or ${getCommandName('login')}.`
    );
    return 'failed';
  }
  if (state) {
    const remaining = ms(state.expiresAt - Date.now());
    if (state.expiresAt - Date.now() < 10 * 60 * 1000) {
      output.warn(
        `Anonymous deployment expires in ${remaining}. Run ${getCommandName('login')} to keep it.`
      );
    } else {
      output.log(`Anonymous deployment expires in ${remaining}.`);
    }
  } else {
    try {
      state = await bootstrapAnonymousProject(client);
    } catch (err: unknown) {
      output.debug(`Anonymous bootstrap failed: ${errorToString(err)}`);
      return 'refused';
    }
    await writeAnonymousState(cwd, state);
    output.log(
      `Deploying anonymously. This deployment expires in ${ms(state.expiresAt - Date.now())}. Run ${getCommandName('login')} to keep it.`
    );
  }
  client.authConfig = { token: state.token, skipWrite: true };
  return {
    status: 'linked',
    anonymous: true,
    expiresAt: state.expiresAt,
    org: { type: 'user', id: '', slug: 'anonymous' },
    project: { id: state.projectId, name: state.projectId } as Project,
  };
}
