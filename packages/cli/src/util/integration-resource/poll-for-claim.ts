import ms from 'ms';
import output from '../../output-manager';
import sleep from '../sleep';
import type Client from '../client';
import { getResource } from './get-resource';
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
 * Discriminated result so callers can map each outcome to an exit code
 * without `pollForClaim` calling `process.exit` itself (keeps the helper
 * testable and free of side effects on the process).
 */
export type PollForClaimResult =
  | { status: 'claimed'; resource: Resource }
  | { status: 'timeout' }
  | { status: 'cancelled' };

/**
 * Polls the per-store endpoint waiting for the resource's `ownership` to flip
 * away from `'sandbox'`. Stripe transitions to `'linked'`, Shopify to `'owned'`
 * — anything that's no longer `'sandbox'` counts as claimed. The per-store
 * endpoint does a live partner fetch, so it returns fresh `ownership` even
 * when the partner's webhook to Vercel hasn't fired (the list endpoint reads
 * stale DB data and would never see Shopify claims propagate).
 *
 * On SIGINT, returns `{ status: 'cancelled' }` after printing the
 * still-in-progress hint — the caller decides the exit code (typically 130).
 */
export async function pollForClaim(
  client: Client,
  resourceId: string,
  options: PollForClaimOptions = {}
): Promise<PollForClaimResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let cancelled = false;
  let resolveCancelled: (() => void) | undefined;
  const cancelledSignal = new Promise<void>(resolve => {
    resolveCancelled = resolve;
  });
  const onSigint = () => {
    cancelled = true;
    resolveCancelled?.();
  };
  process.on('SIGINT', onSigint);

  try {
    output.spinner('Waiting for claim to complete in browser...');

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !cancelled) {
      // Race the sleep against the cancel signal so Ctrl-C mid-sleep
      // breaks out of the loop immediately instead of waiting up to
      // POLL_INTERVAL_MS for the next iteration check.
      await Promise.race([sleep(POLL_INTERVAL_MS), cancelledSignal]);
      if (cancelled) break;

      try {
        const updated = await getResource(client, resourceId);
        // Require an explicit non-sandbox ownership value before declaring
        // claimed. The truthiness guard keeps us polling when a partner
        // fetch transiently returns a resource without an `ownership` field,
        // rather than misreporting that as success.
        if (updated.ownership && updated.ownership !== 'sandbox') {
          output.stopSpinner();
          return { status: 'claimed', resource: updated };
        }
      } catch (error) {
        output.debug(`Polling error (will retry): ${error}`);
      }
    }

    output.stopSpinner();

    if (cancelled) {
      output.print('\n');
      output.log(SANDBOX_CLAIM_IN_PROGRESS_MSG);
      return { status: 'cancelled' };
    }

    output.error(
      `Claim did not complete within ${ms(timeoutMs, { long: true })}.`
    );
    output.log(SANDBOX_CLAIM_IN_PROGRESS_MSG);
    return { status: 'timeout' };
  } finally {
    process.off('SIGINT', onSigint);
  }
}
