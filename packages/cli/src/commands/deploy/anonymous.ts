import { join } from 'path';
import type * as tty from 'tty';
import fs from 'fs-extra';
import type Client from '../../util/client';
import {
  clearAnonymousState,
  ensureAnonymousLink,
  type AnonymousLink,
} from '../../util/deploy/anonymous';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { ensureLink } from '../../util/link/ensure-link';
import promptMissingCredentials from '../../util/login/prompt-missing-credentials';
import param from '../../util/output/param';
import { getCommandName } from '../../util/pkg-name';
import {
  linkFolderToProject,
  VERCEL_DIR,
  VERCEL_DIR_PROJECT,
} from '../../util/projects/link';
import output from '../../output-manager';
import login from '../login';

export function validateAnonymousTarget(
  isAnonymous: boolean,
  target: string | undefined
) {
  if (isAnonymous && target && target !== 'production') {
    output.error(
      `Anonymous deployments always target production, so "${target}" is not available. Remove the ${param(
        '--target'
      )} option, or run ${getCommandName('login')} to deploy to other environments.`
    );
    return false;
  }
  return true;
}

export async function setupAnonymousDeployment(
  client: Client,
  cwd: string,
  { isAnonymous, dryRun }: { isAnonymous: boolean; dryRun: boolean }
): Promise<
  number | { isAnonymous: boolean; anonymousLink: AnonymousLink | undefined }
> {
  if (!isAnonymous) {
    await clearAnonymousState(cwd);
  }

  let anonymousLink: AnonymousLink | undefined;
  if (isAnonymous) {
    const anonymous = await ensureAnonymousLink(client, cwd, {
      requireExistingState: dryRun,
    });
    if (anonymous === 'refused') {
      const loginExitCode = await promptMissingCredentials(client);
      if (loginExitCode !== 0) {
        return loginExitCode;
      }
      isAnonymous = false;
    } else if (anonymous === 'failed') {
      return 1;
    } else if (anonymous === 'confirmation-required') {
      return 1;
    } else {
      anonymousLink = anonymous;
    }
  }
  return { isAnonymous, anonymousLink };
}

export async function handleAnonymousDeploymentError({
  client,
  cwd,
  error,
  link,
  isV0,
  retry,
}: {
  client: Client;
  cwd: string;
  error: unknown;
  link: AnonymousLink | undefined;
  isV0: boolean;
  retry: () => Promise<number>;
}): Promise<number | undefined> {
  if (!link || !isAPIError(error)) {
    return;
  }

  if (error.code === 'anonymous_project_claimed') {
    if (client.nonInteractive || !client.stdin.isTTY) {
      output.prettyError({
        message: `This project was claimed successfully. Run ${getCommandName('login')} to continue deploying it.`,
      });
      return 1;
    }

    output.log(
      'This project was claimed successfully. Log in to continue deploying it.'
    );
    let loginExitCode: number;
    try {
      loginExitCode = await login(client, { shouldParseArgs: false });
    } catch (loginError) {
      printError(loginError);
      return 1;
    }
    if (loginExitCode !== 0) {
      return loginExitCode;
    }

    const claimedProjectLink = await ensureLink('deploy', client, cwd, {
      autoConfirm: true,
      projectName: link.project.id,
      failIfNotFound: true,
      allowOwnerLookupFallback: true,
      v0: isV0,
    });
    if (typeof claimedProjectLink === 'number') {
      return claimedProjectLink;
    }

    await linkFolderToProject(
      client,
      cwd,
      {
        projectId: claimedProjectLink.project.id,
        orgId: claimedProjectLink.org.id,
      },
      claimedProjectLink.project.name,
      claimedProjectLink.org.slug,
      'link',
      true,
      false
    );
    await clearAnonymousState(cwd);
    return retry();
  }

  if (error.status === 401 || error.status === 410) {
    await clearAnonymousState(cwd);
    output.prettyError({
      message: `Your temporary deployment has expired. Run ${getCommandName('login')} to create an account and keep deploying this app.`,
    });
    return 1;
  }
}

export async function runImplicitBuild(
  client: Client,
  cwd: string
): Promise<number> {
  const projectJsonPath = join(cwd, VERCEL_DIR, VERCEL_DIR_PROJECT);
  if (!(await fs.pathExists(projectJsonPath))) {
    // Settings-only `project.json` (no projectId/orgId) is treated as
    // unlinked everywhere else, so `vercel build` runs without linking.
    await fs.outputJSON(projectJsonPath, { settings: {} }, { spaces: 2 });
  }

  // Without a `package.json` the build only copies static files, so it is
  // fast enough that announcing it is noise.
  if (await fs.pathExists(join(cwd, 'package.json'))) {
    output.log('Building your project locally…');
  }

  const originalArgv = client.argv;
  const originalCwd = client.cwd;
  const originalStdout = client.stdout;

  client.cwd = cwd;
  client.setArgv([...originalArgv.slice(0, 2), 'build', '--prod', '--yes']);
  // The build's agent JSON payload would emit a second document on a stdout
  // that must hold only the deploy's.
  client.stdout = createSinkStream();
  try {
    const build = (await import('../build')).default;
    return await build(client);
  } finally {
    client.setArgv(originalArgv);
    client.cwd = originalCwd;
    client.stdout = originalStdout;
  }
}

function createSinkStream(): tty.WriteStream {
  return { isTTY: false, write: () => true } as unknown as tty.WriteStream;
}
