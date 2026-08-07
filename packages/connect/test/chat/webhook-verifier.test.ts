import { verifyVercelOidcToken } from '@vercel/oidc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConnectWebhookVerifier } from '../../src/chat/index.js';

vi.mock('@vercel/oidc', () => ({
  verifyVercelOidcToken: vi.fn(),
}));

describe('createConnectWebhookVerifier', () => {
  beforeEach(() => {
    vi.mocked(verifyVercelOidcToken).mockResolvedValue(
      {} as Awaited<ReturnType<typeof verifyVercelOidcToken>>
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('verifies a forwarded bearer token and returns true', async () => {
    const verifier = createConnectWebhookVerifier();
    const request = new Request('https://example.com/api/webhooks/slack', {
      headers: { authorization: 'Bearer connect_oidc_token' },
    });

    await expect(verifier(request, '{}')).resolves.toBe(true);
    expect(verifyVercelOidcToken).toHaveBeenCalledWith(
      'connect_oidc_token',
      undefined
    );
  });

  it('forwards verifier options to verifyVercelOidcToken', async () => {
    const options = { projectId: 'prj_123', environment: 'production' };
    const verifier = createConnectWebhookVerifier(options);
    const request = new Request('https://example.com/api/webhooks/github', {
      headers: { authorization: 'Bearer another_token' },
    });

    await verifier(request, '{}');
    expect(verifyVercelOidcToken).toHaveBeenCalledWith(
      'another_token',
      options
    );
  });

  it('trims surrounding whitespace from the token', async () => {
    const verifier = createConnectWebhookVerifier();
    const request = new Request('https://example.com/api/webhooks/linear', {
      headers: { authorization: 'Bearer   spaced_token   ' },
    });

    await verifier(request, '{}');
    expect(verifyVercelOidcToken).toHaveBeenCalledWith(
      'spaced_token',
      undefined
    );
  });

  it('accepts a case-insensitive bearer scheme', async () => {
    const verifier = createConnectWebhookVerifier();
    const request = new Request('https://example.com/api/webhooks/slack', {
      headers: { authorization: 'bearer lower_case_token' },
    });

    await expect(verifier(request, '{}')).resolves.toBe(true);
    expect(verifyVercelOidcToken).toHaveBeenCalledWith(
      'lower_case_token',
      undefined
    );
  });

  it('throws when the Authorization header is missing', async () => {
    const verifier = createConnectWebhookVerifier();
    const request = new Request('https://example.com/api/webhooks/slack');

    await expect(verifier(request, '{}')).rejects.toThrow(
      'Missing Authorization bearer token'
    );
    expect(verifyVercelOidcToken).not.toHaveBeenCalled();
  });

  it('throws when the Authorization header is not a bearer token', async () => {
    const verifier = createConnectWebhookVerifier();
    const request = new Request('https://example.com/api/webhooks/slack', {
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    await expect(verifier(request, '{}')).rejects.toThrow(
      'Missing Authorization bearer token'
    );
    expect(verifyVercelOidcToken).not.toHaveBeenCalled();
  });

  it('propagates verification failures', async () => {
    vi.mocked(verifyVercelOidcToken).mockRejectedValue(
      new Error('invalid token')
    );
    const verifier = createConnectWebhookVerifier();
    const request = new Request('https://example.com/api/webhooks/slack', {
      headers: { authorization: 'Bearer bad_token' },
    });

    await expect(verifier(request, '{}')).rejects.toThrow('invalid token');
  });
});
