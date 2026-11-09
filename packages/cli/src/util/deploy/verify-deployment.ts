import bytes from 'bytes';
import stripAnsi from 'strip-ansi';
import { errorToString } from '@vercel/error-utils';
import type { Org, Project } from '@vercel-internals/types';
import type Client from '../client';
import fetch, { type Response } from '../fetch';
import output from '../../output-manager';
import getProjectByIdOrName from '../projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../errors-ts';
import { getOrCreateDeploymentProtectionToken } from '../../commands/curl/bypass-token';

export interface DeploymentVerification {
  url: string;
  ok: boolean;
  statusCode: number | null;
  /** Response body size in bytes. */
  size: number | null;
  title: string | null;
  error: string | null;
}

interface VerifyDeploymentOptions {
  /** The deployment's project and owner, used to get past protection. */
  project?: Pick<Project, 'id' | 'accountId'>;
  org?: Org;
  /** Whether the project has Deployment Protection turned on. */
  protectionEnabled: boolean;
}

const TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
// `<title>` sits in `<head>`, so only the start of the page is searched.
const TITLE_SEARCH_LENGTH = 64 * 1024;
const TITLE_MAX_LENGTH = 200;

/**
 * Loads a ready deployment's URL and reports what came back. On a protected
 * project a 401 or 403 is retried with the project's Protection Bypass for
 * Automation secret, which is created when missing, as `vercel curl` does.
 * Never throws: a failed request is a result with `ok: false`.
 */
export async function verifyDeployment(
  client: Client,
  url: string,
  { project, org, protectionEnabled }: VerifyDeploymentOptions
): Promise<DeploymentVerification> {
  try {
    let res = await request(url);
    if (
      (res.status === 401 || res.status === 403) &&
      protectionEnabled &&
      project &&
      org
    ) {
      const bypassToken = await getBypassToken(client, project, org);
      if (bypassToken) {
        await res.body?.cancel();
        res = await request(url, bypassToken);
      }
    }
    return await readVerification(url, res);
  } catch (err: unknown) {
    // `fetch` only says "fetch failed"; the cause names DNS, TLS, or refusal.
    const cause =
      err instanceof Error && err.cause instanceof Error
        ? `: ${err.cause.message}`
        : '';
    return {
      url,
      ok: false,
      statusCode: null,
      size: null,
      title: null,
      error: `${errorToString(err)}${cause}`,
    };
  }
}

/**
 * Follows redirects by hand so the bypass secret only goes to the deployment's
 * own origin. `fetch` would send it to wherever a redirect points, and anyone
 * holding it can get past the project's Deployment Protection.
 */
async function request(url: string, bypassToken?: string): Promise<Response> {
  const deploymentOrigin = new URL(url).origin;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let current = url;

  for (let redirects = 0; ; redirects++) {
    const headers: Record<string, string> = {};
    if (bypassToken && new URL(current).origin === deploymentOrigin) {
      headers['x-vercel-protection-bypass'] = bypassToken;
    }
    const res = await fetch(current, { headers, redirect: 'manual', signal });
    const location = res.headers.get('location');
    if (!REDIRECT_STATUSES.has(res.status) || !location) {
      return res;
    }

    await res.body?.cancel();
    if (redirects === MAX_REDIRECTS) {
      throw new Error(`Too many redirects (more than ${MAX_REDIRECTS})`);
    }
    current = new URL(location, current).href;
  }
}

async function getBypassToken(
  client: Client,
  { id, accountId }: Pick<Project, 'id' | 'accountId'>,
  org: Org
): Promise<string | null> {
  try {
    // Read the project's current secrets: the deploy's copy may not list
    // them, and creating one the project already has would add a second.
    const project = await getProjectByIdOrName(client, id, accountId);
    if (project instanceof ProjectNotFound) {
      return null;
    }
    return await getOrCreateDeploymentProtectionToken(client, {
      status: 'linked',
      project,
      org,
    });
  } catch (err: unknown) {
    output.debug(`Could not get a protection bypass secret: ${err}`);
    return null;
  }
}

async function readVerification(
  url: string,
  res: Response
): Promise<DeploymentVerification> {
  const isHtml = (res.headers.get('content-type') ?? '').includes('text/html');
  const decoder = new TextDecoder();
  let size = 0;
  let head = '';

  // Count every byte but keep only the start, so a large file can't fill memory.
  const reader = res.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (isHtml && head.length < TITLE_SEARCH_LENGTH) {
        head += decoder.decode(value, { stream: true });
      }
    }
  }

  return {
    url,
    ok: res.ok,
    statusCode: res.status,
    size,
    title: isHtml ? parseTitle(head) : null,
    error: null,
  };
}

/** `200, 1.2 KB, "Q3 report"` */
export function formatVerificationSummary({
  statusCode,
  size,
  title,
}: DeploymentVerification): string {
  return [
    statusCode,
    size === null
      ? null
      : bytes.format(size, { decimalPlaces: 1, unitSeparator: ' ' }),
    title === null ? null : `"${title}"`,
  ]
    .filter(part => part !== null)
    .join(', ');
}

export function formatVerificationFailure({
  url,
  statusCode,
  error,
}: DeploymentVerification): string {
  return statusCode === null
    ? `Couldn't load ${url}: ${error}`
    : `${url} returned ${statusCode}.`;
}

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
};

function parseTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) {
    return null;
  }
  // The title is remote text, so drop control characters before printing it.
  const title = Array.from(
    stripAnsi(match[1]).replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, entity => {
      return HTML_ENTITIES[entity];
    })
  )
    .map(char => (char < ' ' || char === '\u007f' ? ' ' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return title ? title.slice(0, TITLE_MAX_LENGTH) : null;
}
