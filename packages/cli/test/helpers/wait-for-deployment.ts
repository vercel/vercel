import ms from 'ms';
import nodeFetch, {
  type RequestInfo,
  type RequestInit,
  type Response,
} from '../../src/util/fetch';
import sleep from '../../src/util/sleep';

const DEFAULT_TIMEOUT_MS = ms('2m');

/**
 * Poll until the edge is serving the deployment.
 *
 * `vercel deploy` returns after the API reports READY, but a follow-up GET
 * can still receive the platform `DEPLOYMENT_NOT_FOUND` page for a few
 * seconds (`x-vercel-error: DEPLOYMENT_NOT_FOUND`). Call this instead of a
 * single fetch after deploy.
 */
export async function waitForDeployment(
  href: RequestInfo,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<{ response: Response; text: string }> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchInit } = init;
  console.log(`waiting for ${String(href)} to become ready...`);
  const start = Date.now();

  while (true) {
    const response = await nodeFetch(href, fetchInit);
    const text = await response.text();

    if (response.headers.get('x-vercel-error') !== 'DEPLOYMENT_NOT_FOUND') {
      return { response, text };
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `Waiting for "${String(href)}" failed since it took longer than ${timeoutMs}ms.\n` +
          `Received status ${response.status}:\n${text}`
      );
    }

    await sleep(2000);
  }
}

/** Last non-empty line of CLI stdout, which is the deployment URL in CI. */
export function pickDeploymentUrl(stdout: string): string {
  const lines = stdout.trim().split('\n');
  return lines[lines.length - 1].trim();
}
