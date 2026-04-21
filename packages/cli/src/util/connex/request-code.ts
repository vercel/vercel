import { randomBytes, createHash } from 'node:crypto';
import output from '../../output-manager';
import type Client from '../client';
import sleep from '../sleep';

export interface ConnexResult {
  status: 'pending' | 'partial' | 'success' | 'error';
  progress?: string;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 30 * 60 * 1000;
const MAX_EARLY_404_COUNT = 3;

/**
 * Generates a PKCE-like pair: `verifier` is the random secret kept by the
 * CLI and used to poll for the result; `requestCode` is its SHA-256 hash
 * sent to the API and used as the Redis lookup key.
 */
export function generateRequestCode(): {
  verifier: string;
  requestCode: string;
} {
  const verifier = randomBytes(37).toString('base64url');
  const requestCode = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, requestCode };
}

/**
 * Polls `GET /v1/connex/result/{verifier}` until the request code resolves
 * to success or error, or the timeout is reached.
 *
 * Returns the result data on success, or null on failure (error is
 * printed to output).
 */
export async function awaitConnexResult(
  client: Client,
  verifier: string
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + MAX_POLL_DURATION_MS;
  let early404Count = 0;
  let lastProgress: string | undefined;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    try {
      const result = await client.fetch<ConnexResult>(
        `/v1/connex/result/${encodeURIComponent(verifier)}`
      );

      if (result.status === 'success' && result.data) {
        return result.data;
      }

      if (result.status === 'partial' && result.data) {
        if (result.progress && result.progress !== lastProgress) {
          lastProgress = result.progress;
          output.stopSpinner();
          const clientId = result.data.clientId as string | undefined;
          if (clientId) {
            output.log(`Client created: ${clientId}`);
          }
          output.spinner(`${result.progress}...`);
        }
        continue;
      }

      if (result.status === 'error' && result.error) {
        output.error(
          `Setup failed: ${result.error.message} (${result.error.code})`
        );
        return null;
      }
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        early404Count++;
        if (early404Count > MAX_EARLY_404_COUNT) {
          output.error('Setup request expired. Please try again.');
          return null;
        }
        output.debug(
          `Polling 404 (${early404Count}/${MAX_EARLY_404_COUNT}), will retry`
        );
        continue;
      }
      output.debug(`Polling error (will retry): ${err}`);
    }
  }

  output.error('Timed out waiting for setup to complete. Please try again.');
  return null;
}
