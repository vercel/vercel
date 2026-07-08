import { describe, expect, it } from 'vitest';
import { APIError } from '@vercel/sandbox';
import { formatSandboxError } from '../../../../src/util/sandbox/format-error';

describe('formatSandboxError', () => {
  it('formats an APIError with url and status', async () => {
    const response = new Response('{"error":{"message":"nope"}}', {
      status: 403,
      statusText: 'Forbidden',
    });
    Object.defineProperty(response, 'url', {
      value: 'https://vercel.com/api/x',
    });
    const err = new APIError(response, {
      json: { error: { message: 'nope' } },
      text: '{}',
    });
    const msg = await formatSandboxError(err);
    expect(msg).toContain('nope');
    expect(msg).toContain('status code: 403');
  });

  it('returns null for unrelated errors', async () => {
    expect(await formatSandboxError(new Error('boom'))).toBeNull();
  });
});
