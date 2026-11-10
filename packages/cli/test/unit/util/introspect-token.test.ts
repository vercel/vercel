import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../mocks/client';
import { introspectToken } from '../../../src/util/introspect-token';
import { inspectTokenRequest } from '../../../src/util/oauth';
import type { Response } from '../../../src/util/fetch';

vi.mock('../../../src/util/oauth', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../src/util/oauth')>()),
  inspectTokenRequest: vi.fn(),
}));

const inspectTokenRequestMock = vi.mocked(inspectTokenRequest);
let mockApiUrl: string;

function mockResponse(data: unknown): Response {
  return { json: async () => data } as unknown as Response;
}

beforeEach(() => {
  mockApiUrl = client.apiUrl;
  client.apiUrl = 'https://api.vercel.com';
});

afterEach(() => {
  client.apiUrl = mockApiUrl;
  inspectTokenRequestMock.mockReset();
});

describe('introspectToken', () => {
  it('returns the introspection payload', async () => {
    inspectTokenRequestMock.mockResolvedValue(
      mockResponse({
        active: true,
        client_id: 'app_dummy',
        team: { id: 'team_dummy' },
      })
    );

    await expect(introspectToken(client)).resolves.toEqual({
      active: true,
      client_id: 'app_dummy',
      team: { id: 'team_dummy' },
    });
    expect(inspectTokenRequestMock).toHaveBeenCalledWith(
      client.authConfig.token
    );
  });

  it('throws on an invalid introspection response', async () => {
    inspectTokenRequestMock.mockResolvedValue(mockResponse({ nope: true }));

    await expect(introspectToken(client)).rejects.toThrow(
      'Could not introspect token.'
    );
  });

  it('throws when the client has no token', async () => {
    client.authConfig.token = undefined;

    await expect(introspectToken(client)).rejects.toThrow(
      'No token to introspect'
    );
    expect(inspectTokenRequestMock).not.toHaveBeenCalled();
  });

  it('does not disclose custom API credentials to Vercel', async () => {
    client.apiUrl = 'https://api.example.test';

    await expect(introspectToken(client)).rejects.toThrow(
      'Token introspection is unavailable for custom API origins'
    );
    expect(inspectTokenRequestMock).not.toHaveBeenCalled();
  });
});
