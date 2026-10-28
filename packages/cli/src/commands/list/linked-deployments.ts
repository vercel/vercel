import { getPlatformEnv } from '@vercel/build-utils';
import type {
  Deployment,
  PaginationOptions,
  ProjectLink,
} from '@vercel-internals/types';
import type Client from '../../util/client';
import sleep from '../../util/sleep';
import {
  getLinkedProject,
  getLinkFromDir,
  getVercelDirectory,
  type ProjectLinkResultWithOrgId,
} from '../../util/projects/link';

export interface DeploymentsPage {
  deployments: Deployment[];
  pagination: PaginationOptions;
}

export interface LinkedDeployments {
  pages: AsyncGenerator<DeploymentsPage>;
  /** When the request was sent, for the elapsed time `list` prints. */
  sentAt: number;
}

/**
 * Runs `getLinkedProject()` and, alongside it, the deployments request for
 * the project in the local link, so the request doesn't wait for the project
 * lookup. The local link is only what `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID`
 * or `.vercel/project.json` say; any other link (`repo.json`) sends nothing.
 *
 * `deployments` is set only when the lookup confirms that link: the same
 * project, owned by the same team or user. Otherwise the early request is
 * canceled and the caller sends its own, as it did before. Without
 * `getQuery` (the flags can't make a query), no request is sent.
 */
export async function getLinkedProjectWithDeployments(
  client: Client,
  getQuery?: (projectId: string) => URLSearchParams
): Promise<{
  link: ProjectLinkResultWithOrgId;
  deployments?: LinkedDeployments;
}> {
  let early: ReturnType<typeof requestDeployments> | undefined;
  if (getQuery) {
    const localLink = await readLocalLink(client.cwd);
    if (localLink) {
      early = requestDeployments(
        client,
        localLink,
        getQuery(localLink.projectId)
      );
    }
  }

  let link: ProjectLinkResultWithOrgId;
  try {
    link = await getLinkedProject(client, { cwd: client.cwd });
  } catch (err: unknown) {
    early?.cancel();
    throw err;
  }

  if (
    early &&
    link.status === 'linked' &&
    link.project.id === early.projectId &&
    link.org.id === early.orgId
  ) {
    return {
      link,
      deployments: { pages: early.pages(), sentAt: early.sentAt },
    };
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

function requestDeployments(
  client: Client,
  { orgId, projectId }: Pick<ProjectLink, 'orgId' | 'projectId'>,
  query: URLSearchParams
) {
  // The same team `list` sends once it sets `currentTeam` to the link's owner.
  query.set('teamId', orgId);
  const url = `/v6/deployments?${query}`;
  const controller = new AbortController();
  const sentAt = Date.now();
  // Only the first page, and without retries: a retry first waits on a timer
  // that `cancel()` can't stop, so a discarded request would keep the CLI
  // from exiting. If it fails, `pages()` sends the request `list` sent
  // before instead, so any error comes from that one.
  const first = client
    .fetch<DeploymentsPage>(url, {
      signal: controller.signal,
      retry: { retries: 0 },
    })
    .catch(() => null);

  return {
    orgId,
    projectId,
    sentAt,
    async *pages() {
      const page = await first;
      if (!page) {
        yield* client.fetchPaginated<DeploymentsPage>(url);
        return;
      }
      yield page;
      const next = page.pagination?.next;
      if (next) {
        // The rest, the way `fetchPaginated()` asks for them.
        await sleep(100);
        const rest = new URLSearchParams(query);
        rest.set('until', String(next));
        yield* client.fetchPaginated<DeploymentsPage>(
          `/v6/deployments?${rest}`
        );
      }
    },
    cancel() {
      controller.abort();
    },
  };
}
