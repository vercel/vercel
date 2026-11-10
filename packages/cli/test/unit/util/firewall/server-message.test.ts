import { describe, expect, it } from 'vitest';
import { apiServerMessage } from '../../../../src/util/firewall/server-message';
import { FIREWALL_ACTIVITY_PLAN_MESSAGE } from '../../../../src/util/firewall/get-firewall-alerts';
import { APIError } from '../../../../src/util/errors-ts';
import type { Response } from '../../../../src/util/fetch';

/** The shape `APIError` reads off a response: a status and headers. */
function response(status: number): Response {
  return { status, headers: { get: () => null } } as unknown as Response;
}

describe('apiServerMessage', () => {
  it('relays what the API said, which names the plans and the upgrade path', () => {
    const message =
      'Observability Plus is required to run this query for team acme and is available on Pro and Enterprise plans. Upgrade your plan to continue. Learn more: https://vercel.com/docs/observability/observability-plus';
    const error = new APIError(message, response(402));

    // Everything the reader needs to act, and none of it survives being
    // flattened into a message of our own.
    expect(apiServerMessage(error)).toContain('Pro and Enterprise');
    expect(apiServerMessage(error)).toContain('team acme');
    expect(apiServerMessage(error)).toContain('vercel.com/docs');
  });

  it('reports nothing, rather than the sentinel, when the API sends no message', () => {
    // Callers substitute their own wording; `Response Error` reads like a
    // failure of ours and tells a reader nothing.
    expect(apiServerMessage(new APIError('', response(402)))).toBeUndefined();
  });

  it('reports nothing for an error that did not come from the API', () => {
    expect(apiServerMessage(undefined)).toBeUndefined();
    expect(apiServerMessage(new Error('boom'))).toBeUndefined();
  });

  it('leaves the firewall activity fallback for callers to apply', () => {
    const error = new APIError('', response(402));
    expect(apiServerMessage(error) ?? FIREWALL_ACTIVITY_PLAN_MESSAGE).toEqual(
      FIREWALL_ACTIVITY_PLAN_MESSAGE
    );
  });
});
