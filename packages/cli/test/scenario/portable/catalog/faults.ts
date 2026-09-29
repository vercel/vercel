import { FORMAT_VERSION, type FaultsCatalog } from '../model/schemas';

/**
 * Faults replace an operation's normal response. They use status 400 on
 * purpose: `Client.fetch` retries 5xx with backoff and sleeps for Retry-After
 * plus up to 30s of random skew on 429. These faults exercise the CLI's
 * `error.code` mapping, not transport retry.
 */
export const faultsCatalog: FaultsCatalog = {
  formatVersion: FORMAT_VERSION,
  faults: {
    rate_limited: {
      summary: 'The API reports `error.code = rate_limited` without a 429.',
      status: 400,
      body: { error: { code: 'rate_limited', message: 'Rate limit exceeded' } },
    },
    client_error: {
      summary: 'A generic non-retried client error.',
      status: 400,
      body: {
        error: { code: 'bad_request', message: 'Teams are unavailable' },
      },
    },
  },
};
