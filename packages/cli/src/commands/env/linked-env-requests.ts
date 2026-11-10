import { getPlatformEnv } from '@vercel/build-utils';
import type { ProjectLink } from '@vercel-internals/types';
import type Client from '../../util/client';
import type { FetchOptions } from '../../util/client';
import output from '../../output-manager';
import {
  getLinkFromDir,
  getVercelDirectory,
  type ProjectLinkResultWithOrgId,
} from '../../util/projects/link';
import { resolveProjectContext } from '../../util/projects/resolve-project-context';

export interface EarlyEnvRequests<T> {
  /** The early responses, or the same requests sent again if they failed. */
  result(): Promise<T>;
  /** When the requests were sent, for the elapsed time `env ls` prints. */
  sentAt: number;
}

/**
 * Runs `resolveProjectContext()` and, alongside it, `send` for the project in
 * the local link, so the env requests don't wait for the project lookup. The
 * local link is only what `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID` or
 * `.vercel/project.json` say; `--project` or any other link (`repo.json`)
 * sends nothing early.
 *
 * `early` is set only when the lookup confirms that link: the same project,
 * owned by the same team or user. Otherwise the early requests are canceled
 * and the caller sends its own, as it did before.
 */
export async function resolveProjectContextWithEnvRequests<T>(
  client: Client,
  {
    projectNameOrId,
    commandName,
  }: { projectNameOrId?: string; commandName: string },
  send: (client: Client, projectId: string) => Promise<T>
): Promise<{
  link: ProjectLinkResultWithOrgId;
  early?: EarlyEnvRequests<T>;
}> {
  const localLink = projectNameOrId ? null : await readLocalLink(client.cwd);
  const early = localLink ? sendEarly(client, localLink, send) : undefined;

  let link: ProjectLinkResultWithOrgId;
  try {
    link = await resolveProjectContext({
      client,
      projectNameOrId,
      commandName,
    });
  } catch (err: unknown) {
    early?.cancel();
    throw err;
  }

  if (
    early &&
    link.status === 'linked' &&
    link.project.id === early.projectId &&
    link.org.id === early.orgId &&
    // The caller scopes its requests to a team owner, and to no team for a
    // user, which is how the early requests were scoped.
    (link.org.type === 'team') === early.orgId.startsWith('team_')
  ) {
    return { link, early: { result: early.result, sentAt: early.sentAt } };
  }
  early?.cancel();
  return { link };
}

async function readLocalLink(
  cwd: string
): Promise<Pick<ProjectLink, 'orgId' | 'projectId'> | null> {
  const orgId = getPlatformEnv('ORG_ID');
  const projectId = getPlatformEnv('PROJECT_ID');
  if (orgId || projectId) {
    // `getLinkedProject()` uses these only as a pair, and errors on just one.
    return orgId && projectId ? { orgId, projectId } : null;
  }
  try {
    return await getLinkFromDir(getVercelDirectory(cwd));
  } catch {
    // `getLinkedProject()` reports an unreadable link.
    return null;
  }
}

function sendEarly<T>(
  client: Client,
  { orgId, projectId }: Pick<ProjectLink, 'orgId' | 'projectId'>,
  send: (client: Client, projectId: string) => Promise<T>
) {
  const controller = new AbortController();
  const sentAt = Date.now();
  // Scoped to the link's owner (`accountId`), as the caller scopes its
  // requests once the lookup confirms the link. Not retried: a retry first
  // waits on a timer that aborting can't stop, so a discarded request would
  // keep the CLI from exiting. And no step-up login for sensitive variables
  // (`nonInteractive`): that's left to the requests `result()` sends instead,
  // so any error comes from those. A SAML error still starts `client.fetch()`'s
  // re-login, as the project lookup's requests for the same team do; the
  // early requests share that login rather than start another.
  const earlyClient = new Proxy(client, {
    get(target, property) {
      if (property === 'fetch') {
        return (url: string, opts: FetchOptions = {}) =>
          target.fetch(url, {
            ...opts,
            accountId: orgId,
            signal: controller.signal,
            retry: { retries: 0 },
          });
      }
      if (property === 'nonInteractive') {
        return true;
      }
      return Reflect.get(target, property, target);
    },
  });
  const responses = send(earlyClient, projectId).then(
    value => ({ value }),
    (err: unknown) => {
      if (!controller.signal.aborted) {
        output.debug(`Early env requests failed: ${err}`);
        // Stops the other request, which `result()` sends again.
        controller.abort();
      }
      return null;
    }
  );

  return {
    orgId,
    projectId,
    sentAt,
    async result() {
      const early = await responses;
      return early ? early.value : send(client, projectId);
    },
    cancel() {
      controller.abort();
    },
  };
}
