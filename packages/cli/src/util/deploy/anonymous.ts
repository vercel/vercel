import { join } from 'path';
import { outputJSON, readJSON, remove } from 'fs-extra';
import ciInfo from 'ci-info';
import { getPlatformEnv } from '@vercel/build-utils';
import { errorToString } from '@vercel/error-utils';
import type { Project, ProjectLinked } from '@vercel-internals/types';
import type Client from '../client';
import output from '../../output-manager';
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
  claimUrl: string;
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
      typeof state.claimUrl === 'string' &&
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
  const { projectId, token, claimUrl, expiresAt } =
    await client.fetch<AnonymousState>('/v1/anonymous/projects?surface=cli', {
      method: 'POST',
      body: {},
      useCurrentTeam: false,
      // Not idempotent: each attempt creates a project server-side.
      retry: { retries: 0 },
    });
  return { projectId, token, claimUrl, expiresAt };
}

export type AnonymousLink = ProjectLinked & {
  anonymous: true;
  expiresAt: number;
  claimUrl: string;
};

export async function ensureAnonymousLink(
  client: Client,
  cwd: string,
  { requireExistingState = false, confirmed = true } = {}
): Promise<AnonymousLink | 'confirmation-required' | 'failed' | 'refused'> {
  if (ciInfo.isCI) {
    return 'refused';
  }

  // A link (real project intent) or a dry run with nothing to show falls back
  // to the standard "log in to deploy" flow. Expiry is different: it's the
  // conversion moment and gets its own explicit message.
  const linked =
    Boolean(getPlatformEnv('ORG_ID') && getPlatformEnv('PROJECT_ID')) ||
    Boolean(await getLinkFromDir(getVercelDirectory(cwd))) ||
    Boolean((await getRepoLink(client, cwd))?.repoConfig);
  if (linked) {
    return 'refused';
  }

  let state = await readAnonymousState(cwd);
  if (state && state.expiresAt <= Date.now()) {
    output.prettyError({
      message: `Your temporary deployment has expired. Run ${getCommandName('login')} to create an account and keep deploying this app.`,
    });
    return 'failed';
  }
  if (!state && requireExistingState) {
    return 'refused';
  }
  if (!confirmed && !state) {
    return 'confirmation-required';
  }
  if (!state) {
    try {
      state = await bootstrapAnonymousProject(client);
    } catch (err: unknown) {
      output.debug(`Anonymous bootstrap failed: ${errorToString(err)}`);
      return 'refused';
    }
    await writeAnonymousState(cwd, state);
    output.log('Not authenticated. Deploying anonymously.');
  }
  client.authConfig = { token: state.token, skipWrite: true };
  // The anonymous token is the sole authority; a stray VERCEL_TEAM_ID would be
  // appended to deploy requests and rejected as an inaccessible scope.
  delete process.env.VERCEL_TEAM_ID;
  return {
    status: 'linked',
    anonymous: true,
    expiresAt: state.expiresAt,
    claimUrl: state.claimUrl,
    org: { type: 'user', id: '', slug: 'anonymous' },
    project: { id: state.projectId, name: state.projectId } as Project,
  };
}
