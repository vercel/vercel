import readline from 'node:readline';
import output from '../../output-manager';
import sleep from '../sleep';
import type Client from '../client';
import { getResources } from './get-resources';
import type { Resource } from './types';

const POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export const SANDBOX_CLAIM_IN_PROGRESS_MSG =
  'Claim still in progress — finish in your browser, then run `vercel integration list` to verify.';

export interface PollForClaimOptions {
  /** Optional override of the polling timeout (ms). Defaults to 5 minutes. */
  timeoutMs?: number;
}

/**
 * Polls `getResources()` waiting for the named resource's `ownership` to flip
 * from `'sandbox'` to `'linked'`. Returns the updated resource on success,
 * or `null` on timeout. Handles SIGINT by printing a "still in progress" hint
 * and exiting with code 130 (POSIX 128 + SIGINT).
 */
export async function pollForClaim(
  client: Client,
  resourceId: string,
  options: PollForClaimOptions = {}
): Promise<Resource | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const rl = readline
    .createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    .on('SIGINT', () => {
      output.stopSpinner();
      output.print('\n');
      output.log(SANDBOX_CLAIM_IN_PROGRESS_MSG);
      process.exit(130);
    });

  try {
    output.spinner('Waiting for claim to complete in browser...');

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      try {
        const resources = await getResources(client);
        const updated = resources.find(r => r.id === resourceId);
        if (updated && updated.ownership === 'linked') {
          output.stopSpinner();
          return updated;
        }
      } catch (error) {
        output.debug(`Polling error (will retry): ${error}`);
      }
    }

    output.stopSpinner();
    output.error('Claim did not complete within 5 minutes.');
    output.log(SANDBOX_CLAIM_IN_PROGRESS_MSG);
    return null;
  } finally {
    rl.close();
  }
}
