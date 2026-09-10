import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectSendblueCredentials } from '../../src/eve/index.js';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(),
  verifyVercelOidcToken: vi.fn(),
}));

describe('connectSendblueCredentials', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses the sole managed line and Connect webhook verification', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          token: 'sendblue-token',
          expiresAt: Date.now() + 60_000,
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'scl_sendblue',
          uid: 'sendblue/agent',
          name: 'Agent',
          type: 'sendblue',
          service: 'sendblue',
          createdAt: 0,
          updatedAt: 0,
          data: { lines: [{ phone_number: '+14155551234' }] },
        })
      );

    const credentials = connectSendblueCredentials(
      'sendblue/agent',
      {},
      { vercelToken: 'vercel-token' }
    );

    expect(credentials.webhookVerifier).toEqual(expect.any(Function));
    await expect(credentials.accessToken()).resolves.toBe('sendblue-token');
    await expect(credentials.defaultFromNumber()).resolves.toBe('+14155551234');
    await expect(credentials.allowedFromNumbers()).resolves.toEqual([
      '+14155551234',
    ]);
  });

  it('treats malformed Sendblue line metadata as no managed lines', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        id: 'scl_sendblue',
        uid: 'sendblue/agent',
        name: 'Agent',
        type: 'sendblue',
        service: 'sendblue',
        createdAt: 0,
        updatedAt: 0,
        data: {
          lines: [{ phone_number: '+14155551234' }, { phone_number: 123 }],
        },
      })
    );

    const credentials = connectSendblueCredentials(
      'sendblue/agent',
      {},
      { vercelToken: 'vercel-token' }
    );

    await expect(credentials.defaultFromNumber()).rejects.toThrow(
      'has no Sendblue lines'
    );
  });

  it('requires an explicit line when Connect has more than one', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        id: 'scl_sendblue',
        uid: 'sendblue/agent',
        name: 'Agent',
        type: 'sendblue',
        service: 'sendblue',
        createdAt: 0,
        updatedAt: 0,
        data: {
          lines: [
            { phone_number: '+14155551234' },
            { phone_number: '+14155559876' },
          ],
        },
      })
    );

    const credentials = connectSendblueCredentials(
      'sendblue/agent',
      {},
      { vercelToken: 'vercel-token' }
    );

    await expect(credentials.defaultFromNumber()).rejects.toThrow(
      'multiple Sendblue lines'
    );
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });
}
