import { beforeEach, describe, expect, it, vi } from 'vitest';
import { liveErrorReporter } from '../../src/gateways/error-reporter';
import type Client from '../../src/util/client';
import { getSentry } from '../../src/util/get-sentry';
import reportError from '../../src/util/report-error';

vi.mock('../../src/util/get-sentry', () => ({ getSentry: vi.fn() }));
vi.mock('../../src/util/report-error', () => ({ default: vi.fn() }));

describe('liveErrorReporter', () => {
  const sentry = { captureException: vi.fn() };

  beforeEach(() => {
    vi.mocked(getSentry)
      .mockReset()
      .mockResolvedValue(sentry as never);
    vi.mocked(reportError).mockReset().mockResolvedValue(undefined);
  });

  it('reports the error with Sentry and the client', async () => {
    const error = new Error('boom');
    const client = { apiUrl: 'https://api.vercel.com' } as Client;

    await liveErrorReporter().report({ error, client });

    expect(reportError).toHaveBeenCalledWith(sentry, client, error);
  });

  it('reports without a client', async () => {
    const error = new Error('boom');

    await liveErrorReporter().report({ error, client: undefined });

    expect(reportError).toHaveBeenCalledWith(sentry, undefined, error);
  });

  it('propagates reporting failures', async () => {
    vi.mocked(reportError).mockRejectedValue(new Error('sentry down'));

    await expect(
      liveErrorReporter().report({
        error: new Error('boom'),
        client: undefined,
      })
    ).rejects.toThrow('sentry down');
  });
});
