import { afterEach, describe, expect, it, vi } from 'vitest';
import * as authorization from '../../src/authorization.js';
import {
  connectAuthProvider,
  connectMCPTransport,
  ConsentRequiredError,
} from '../../src/tanstack-ai/index.js';
import * as token from '../../src/token.js';
import { UserAuthorizationRequiredError } from '../../src/token.js';

const CONNECTOR = 'oauth/linear';
const PARAMS = { subject: { type: 'user' as const, id: 'user_123' } };
const START = {
  request: 'req_abc',
  verifier: 'verifier_xyz',
  url: 'https://connect.vercel.com/consent/oauth/linear?req=abc',
};

function noGrant(): void {
  vi.spyOn(token, 'getTokenResponse').mockRejectedValue(
    new UserAuthorizationRequiredError('user must authorize')
  );
  vi.spyOn(authorization, 'startAuthorization').mockResolvedValue(START);
}

describe('connectMCPTransport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes the transport config through and attaches a Connect authProvider', () => {
    const transport = connectMCPTransport(
      {
        type: 'http',
        url: 'https://mcp.linear.app/mcp',
        headers: { 'x-vercel-protection-bypass': 'bypass' },
      },
      CONNECTOR,
      PARAMS
    );

    expect(transport).toMatchObject({
      type: 'http',
      url: 'https://mcp.linear.app/mcp',
      headers: { 'x-vercel-protection-bypass': 'bypass' },
    });
    expect(transport).not.toHaveProperty('redirect');
    expect(typeof transport.authProvider.tokens).toBe('function');
    expect(transport.authProvider.clientInformation()).toEqual({
      client_id: CONNECTOR,
    });
  });

  describe('redirect policy', () => {
    it("sse: wraps fetch with redirect: 'manual' so a 3xx is a terminal EventSource response, not a retried rejection", async () => {
      const seen: RequestInit[] = [];
      const customFetch: typeof fetch = async (_input, init) => {
        seen.push(init ?? {});
        return new Response(null);
      };
      const transport = connectMCPTransport(
        { type: 'sse', url: 'https://mcp.linear.app/sse', fetch: customFetch },
        CONNECTOR,
        PARAMS
      );
      await transport.fetch!('https://mcp.linear.app/sse');
      expect(seen).toEqual([{ redirect: 'manual' }]);
    });

    it("http: wraps the caller's fetch so every request carries redirect: 'error' (default)", async () => {
      const seen: RequestInit[] = [];
      const customFetch: typeof fetch = async (_input, init) => {
        seen.push(init ?? {});
        return new Response(null);
      };
      const transport = connectMCPTransport(
        { type: 'http', url: 'https://mcp.linear.app/mcp', fetch: customFetch },
        CONNECTOR,
        PARAMS
      );

      expect(transport.fetch).not.toBe(customFetch);
      await transport.fetch!('https://mcp.linear.app/mcp', {
        method: 'POST',
        headers: { a: 'b' },
      });
      expect(seen).toEqual([
        { method: 'POST', headers: { a: 'b' }, redirect: 'error' },
      ]);
    });

    it('wraps the global fetch when none is supplied, resolving it per call', async () => {
      const original = globalThis.fetch;
      const seen: RequestInit[] = [];
      globalThis.fetch = (async (
        _input: RequestInfo | URL,
        init?: RequestInit
      ) => {
        seen.push(init ?? {});
        return new Response(null);
      }) as typeof fetch;
      try {
        const transport = connectMCPTransport(
          { type: 'http', url: 'https://mcp.linear.app/mcp' },
          CONNECTOR,
          PARAMS
        );
        await transport.fetch!('https://mcp.linear.app/mcp');
        expect(seen).toEqual([{ redirect: 'error' }]);
      } finally {
        globalThis.fetch = original;
      }
    });

    it("passes fetch through untouched with redirect: 'follow'", () => {
      const customFetch: typeof fetch = async () => new Response(null);
      const withFetch = connectMCPTransport(
        { type: 'http', url: 'https://mcp.linear.app/mcp', fetch: customFetch },
        CONNECTOR,
        PARAMS,
        { redirect: 'follow' }
      );
      expect(withFetch.fetch).toBe(customFetch);

      const withoutFetch = connectMCPTransport(
        { type: 'http', url: 'https://mcp.linear.app/mcp' },
        CONNECTOR,
        PARAMS,
        { redirect: 'follow' }
      );
      expect(withoutFetch.fetch).toBeUndefined();
    });

    it('does not leak the redirect option into the provider options', async () => {
      noGrant();
      const transport = connectMCPTransport(
        { type: 'http', url: 'https://mcp.linear.app/mcp' },
        CONNECTOR,
        PARAMS,
        { redirect: 'follow', consent: 'transport' }
      );
      expect(await transport.authProvider.tokens()).toBeUndefined();
    });
  });

  it("selects eager consent for type: 'http' (tokens() raises the challenge)", async () => {
    noGrant();
    const transport = connectMCPTransport(
      { type: 'http', url: 'https://mcp.linear.app/mcp' },
      CONNECTOR,
      PARAMS
    );

    await expect(transport.authProvider.tokens()).rejects.toBeInstanceOf(
      ConsentRequiredError
    );
    expect(authorization.startAuthorization).toHaveBeenCalledTimes(1);
  });

  it("selects transport consent for type: 'sse' (tokens() returns undefined, no authorize call)", async () => {
    noGrant();
    const transport = connectMCPTransport(
      { type: 'sse', url: 'https://mcp.linear.app/sse' },
      CONNECTOR,
      PARAMS
    );

    // A throw here would be flattened into a reconnect loop by the
    // official SDK's SSE EventSource; the spec path must be used.
    expect(await transport.authProvider.tokens()).toBeUndefined();
    expect(authorization.startAuthorization).not.toHaveBeenCalled();

    await expect(
      transport.authProvider.redirectToAuthorization(new URL('https://x'))
    ).rejects.toBeInstanceOf(ConsentRequiredError);
  });

  it('honours an explicit consent override', async () => {
    noGrant();
    const http = connectMCPTransport(
      { type: 'http', url: 'https://mcp.linear.app/mcp' },
      CONNECTOR,
      PARAMS,
      { consent: 'transport' }
    );
    expect(await http.authProvider.tokens()).toBeUndefined();
  });

  it('forwards the remaining adapter options', async () => {
    noGrant();
    const vercelToken = vi.fn().mockResolvedValue('fresh_oidc');
    const transport = connectMCPTransport(
      { type: 'http', url: 'https://mcp.linear.app/mcp' },
      CONNECTOR,
      PARAMS,
      {
        vercelToken,
        redirectUrl: 'https://app.example.com/integrations',
        deviceCode: true,
      }
    );

    await expect(transport.authProvider.tokens()).rejects.toBeInstanceOf(
      ConsentRequiredError
    );
    expect(transport.authProvider.redirectUrl).toBe(
      'https://app.example.com/integrations'
    );
    expect(authorization.startAuthorization).toHaveBeenCalledWith(
      CONNECTOR,
      PARAMS,
      {
        vercelToken: 'fresh_oidc',
        callbackUrl: 'https://app.example.com/integrations',
        deviceCode: true,
      }
    );
  });

  it("re-exports connectAuthProvider with the shared 'transport' default", async () => {
    noGrant();
    expect(await connectAuthProvider(CONNECTOR, PARAMS).tokens()).toBe(
      undefined
    );
    expect(authorization.startAuthorization).not.toHaveBeenCalled();
  });
});
