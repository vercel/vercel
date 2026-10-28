import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONNECT_DISCOVERY_STATE,
  CONNECT_MANAGED_REDIRECT_URL,
  connectAuthProvider,
  ConsentRequiredError,
  getConsentChallenge,
  isConsentRequiredError,
  type ConsentChallenge,
} from '../../src/mcp/connect-auth-provider.js';
import * as authorization from '../../src/authorization.js';
import * as token from '../../src/token.js';
import {
  ConnectorInstallationRequiredError,
  UserAuthorizationRequiredError,
} from '../../src/token.js';

const CONNECTOR = 'oauth/linear';
const PARAMS = { subject: { type: 'user' as const, id: 'user_123' } };

describe('connectAuthProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('tokens()', () => {
    it('returns an OAuthTokens shape with the Connect access token', async () => {
      vi.spyOn(token, 'getTokenResponse').mockResolvedValue({
        token: 'access_token_value',
        expiresAt: Date.now() + 60 * 60 * 1000,
        connector: { id: 'scl_abc', uid: CONNECTOR, type: 'oauth' },
      });

      const provider = connectAuthProvider(CONNECTOR, PARAMS, {
        vercelToken: 'vercel_oidc_token',
      });
      const result = await provider.tokens();

      expect(result).toEqual({
        access_token: 'access_token_value',
        token_type: 'Bearer',
        expires_in: 3600,
      });
      expect(token.getTokenResponse).toHaveBeenCalledWith(CONNECTOR, PARAMS, {
        vercelToken: 'vercel_oidc_token',
      });
    });

    it('resolves a vercelToken callback at call time', async () => {
      vi.spyOn(token, 'getTokenResponse').mockResolvedValue({
        token: 'access_token_value',
        expiresAt: Date.now() + 60 * 60 * 1000,
        connector: { id: 'scl_abc', uid: CONNECTOR, type: 'oauth' },
      });

      const vercelToken = vi.fn().mockResolvedValue('fresh_token');
      const provider = connectAuthProvider(CONNECTOR, PARAMS, { vercelToken });
      await provider.tokens();

      expect(vercelToken).toHaveBeenCalledTimes(1);
      expect(token.getTokenResponse).toHaveBeenCalledWith(CONNECTOR, PARAMS, {
        vercelToken: 'fresh_token',
      });
    });

    it('returns at least 1 second of expires_in even when the token is near expiry', async () => {
      vi.spyOn(token, 'getTokenResponse').mockResolvedValue({
        token: 'expiring_token',
        expiresAt: Date.now() - 100,
        connector: { id: 'scl_abc', uid: CONNECTOR, type: 'oauth' },
      });

      const provider = connectAuthProvider(CONNECTOR, PARAMS);
      const result = await provider.tokens();

      expect(result?.expires_in).toBe(1);
    });

    it('returns undefined when Connect requires user authorization (lets MCP transport drive consent)', async () => {
      vi.spyOn(token, 'getTokenResponse').mockRejectedValue(
        new UserAuthorizationRequiredError('user must authorize')
      );

      const provider = connectAuthProvider(CONNECTOR, PARAMS);
      expect(await provider.tokens()).toBeUndefined();
    });

    it('throws ConnectorInstallationRequiredError without masking it as a consent challenge', async () => {
      vi.spyOn(token, 'getTokenResponse').mockRejectedValue(
        new ConnectorInstallationRequiredError('install required')
      );

      const provider = connectAuthProvider(CONNECTOR, PARAMS);
      await expect(provider.tokens()).rejects.toBeInstanceOf(
        ConnectorInstallationRequiredError
      );
    });

    it('passes other errors through unchanged', async () => {
      const networkError = new Error('connect/ECONNREFUSED');
      vi.spyOn(token, 'getTokenResponse').mockRejectedValue(networkError);

      const provider = connectAuthProvider(CONNECTOR, PARAMS);
      await expect(provider.tokens()).rejects.toBe(networkError);
    });
  });

  describe('redirectToAuthorization()', () => {
    it('throws ConsentRequiredError with the Connect-issued URL by default', async () => {
      vi.spyOn(authorization, 'startAuthorization').mockResolvedValue({
        request: 'req_abc',
        verifier: 'verifier_xyz',
        url: 'https://connect.vercel.com/consent/oauth/linear?req=abc',
      });

      const provider = connectAuthProvider(CONNECTOR, PARAMS, {
        vercelToken: 'vercel_oidc_token',
        redirectUrl: 'https://example.com/callback',
      });

      const ignoredUrl = new URL('https://mcp.linear.app/auth/authorize');
      await expect(
        provider.redirectToAuthorization(ignoredUrl)
      ).rejects.toMatchObject({
        name: 'ConsentRequiredError',
        connector: CONNECTOR,
        subject: PARAMS.subject,
        url: 'https://connect.vercel.com/consent/oauth/linear?req=abc',
        request: 'req_abc',
        verifier: 'verifier_xyz',
      });

      expect(authorization.startAuthorization).toHaveBeenCalledWith(
        CONNECTOR,
        PARAMS,
        {
          vercelToken: 'vercel_oidc_token',
          callbackUrl: 'https://example.com/callback',
        }
      );
    });

    it('surfaces deviceCode and expiresAt from the Connect response', async () => {
      const expiresAt = Date.now() + 5 * 60 * 1000;
      vi.spyOn(authorization, 'startAuthorization').mockResolvedValue({
        request: 'req_abc',
        verifier: 'verifier_xyz',
        url: 'https://connect.vercel.com/consent/oauth/linear?req=abc',
        deviceCode: 'WDJB-MJHT',
        expiresAt,
      });

      const provider = connectAuthProvider(CONNECTOR, PARAMS);
      await expect(
        provider.redirectToAuthorization(new URL('https://ignored'))
      ).rejects.toMatchObject({
        deviceCode: 'WDJB-MJHT',
        expiresAt,
      });
    });

    it('forwards deviceCode: true to startAuthorization when configured', async () => {
      vi.spyOn(authorization, 'startAuthorization').mockResolvedValue({
        request: 'req_abc',
        verifier: 'verifier_xyz',
        url: 'https://connect.vercel.com/consent',
      });

      const provider = connectAuthProvider(CONNECTOR, PARAMS, {
        deviceCode: true,
      });

      await expect(
        provider.redirectToAuthorization(new URL('https://ignored'))
      ).rejects.toBeInstanceOf(ConsentRequiredError);

      expect(authorization.startAuthorization).toHaveBeenCalledWith(
        CONNECTOR,
        PARAMS,
        { deviceCode: true }
      );
    });

    it('omits deviceCode from startAuthorization by default', async () => {
      vi.spyOn(authorization, 'startAuthorization').mockResolvedValue({
        request: 'req_abc',
        verifier: 'verifier_xyz',
        url: 'https://connect.vercel.com/consent',
      });

      const provider = connectAuthProvider(CONNECTOR, PARAMS);
      await expect(
        provider.redirectToAuthorization(new URL('https://ignored'))
      ).rejects.toBeInstanceOf(ConsentRequiredError);

      expect(authorization.startAuthorization).toHaveBeenCalledWith(
        CONNECTOR,
        PARAMS,
        {}
      );
    });

    it('resolves a vercelToken callback at call time', async () => {
      vi.spyOn(authorization, 'startAuthorization').mockResolvedValue({
        request: 'req_abc',
        verifier: 'verifier_xyz',
        url: 'https://connect.vercel.com/consent',
      });

      const vercelToken = vi.fn().mockResolvedValue('fresh_token');
      const provider = connectAuthProvider(CONNECTOR, PARAMS, { vercelToken });

      await expect(
        provider.redirectToAuthorization(new URL('https://ignored'))
      ).rejects.toBeInstanceOf(ConsentRequiredError);

      expect(vercelToken).toHaveBeenCalledTimes(1);
      expect(authorization.startAuthorization).toHaveBeenCalledWith(
        CONNECTOR,
        PARAMS,
        { vercelToken: 'fresh_token' }
      );
    });

    it('invokes the onConsentRequired callback instead of throwing when provided', async () => {
      vi.spyOn(authorization, 'startAuthorization').mockResolvedValue({
        request: 'req_abc',
        verifier: 'verifier_xyz',
        url: 'https://connect.vercel.com/consent/oauth/linear?req=abc',
      });

      const calls: ConsentChallenge[] = [];
      const provider = connectAuthProvider(CONNECTOR, PARAMS, {
        onConsentRequired: challenge => {
          calls.push(challenge);
        },
      });

      await expect(
        provider.redirectToAuthorization(new URL('https://ignored'))
      ).resolves.toBeUndefined();
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe(
        'https://connect.vercel.com/consent/oauth/linear?req=abc'
      );
    });
  });

  describe('OAuthClientProvider surface', () => {
    it('reports the configured redirectUrl, falling back to a non-empty placeholder', () => {
      // Must never be falsy: the official @modelcontextprotocol/sdk
      // auth() reads `!provider.redirectUrl` as "non-interactive
      // client-credentials flow" and would skip redirectToAuthorization.
      expect(connectAuthProvider(CONNECTOR, PARAMS).redirectUrl).toBe(
        CONNECT_MANAGED_REDIRECT_URL
      );
      expect(
        connectAuthProvider(CONNECTOR, PARAMS, { redirectUrl: '' }).redirectUrl
      ).toBe(CONNECT_MANAGED_REDIRECT_URL);
      expect(
        connectAuthProvider(CONNECTOR, PARAMS, {
          redirectUrl: 'https://my.app/oauth/callback',
        }).redirectUrl
      ).toBe('https://my.app/oauth/callback');
    });

    it('exposes minimal but valid client metadata', () => {
      const meta = connectAuthProvider(CONNECTOR, PARAMS).clientMetadata;
      expect(meta).toEqual({ redirect_uris: [] });
    });

    it('uses the connector identifier as the synthetic client_id', () => {
      const info = connectAuthProvider(CONNECTOR, PARAMS).clientInformation();
      expect(info).toEqual({ client_id: CONNECTOR });
    });

    it('saveTokens / saveCodeVerifier are no-ops', () => {
      const provider = connectAuthProvider(CONNECTOR, PARAMS);
      expect(() =>
        provider.saveTokens({ access_token: 'x', token_type: 'Bearer' })
      ).not.toThrow();
      expect(() => provider.saveCodeVerifier('whatever')).not.toThrow();
    });

    it('pre-empts RFC 9728 discovery with a fixed Connect-pointed state', async () => {
      const provider = connectAuthProvider(CONNECTOR, PARAMS);
      const state = provider.discoveryState();
      expect(state).toBe(CONNECT_DISCOVERY_STATE);
      expect(state.authorizationServerUrl).toBe('https://connect.vercel.com');
      expect(
        state.authorizationServerMetadata.response_types_supported
      ).toContain('code');
      expect(
        state.authorizationServerMetadata.code_challenge_methods_supported
      ).toContain('S256');
      expect(() =>
        provider.saveDiscoveryState({ anything: true })
      ).not.toThrow();
      await expect(
        provider.validateResourceURL('https://mcp.example.com/mcp', 'x')
      ).resolves.toBeUndefined();
    });

    it('throws when codeVerifier() is called (Connect owns PKCE server-side)', () => {
      const provider = connectAuthProvider(CONNECTOR, PARAMS);
      expect(() => provider.codeVerifier()).toThrowError(
        /codeVerifier\(\) is unsupported/
      );
    });
  });

  describe("consent: 'eager'", () => {
    const START = {
      request: 'req_abc',
      verifier: 'verifier_xyz',
      url: 'https://connect.vercel.com/consent/oauth/linear?req=abc',
    };

    it('returns tokens normally when Connect has a grant', async () => {
      vi.spyOn(token, 'getTokenResponse').mockResolvedValue({
        token: 'access_token_value',
        expiresAt: Date.now() + 60 * 60 * 1000,
        connector: { id: 'scl_abc', uid: CONNECTOR, type: 'oauth' },
      });
      const start = vi.spyOn(authorization, 'startAuthorization');

      const provider = connectAuthProvider(CONNECTOR, PARAMS, {
        consent: 'eager',
      });
      expect(await provider.tokens()).toMatchObject({
        access_token: 'access_token_value',
      });
      expect(start).not.toHaveBeenCalled();
    });

    it('raises ConsentRequiredError from tokens() instead of returning undefined', async () => {
      vi.spyOn(token, 'getTokenResponse').mockRejectedValue(
        new UserAuthorizationRequiredError('user must authorize')
      );
      vi.spyOn(authorization, 'startAuthorization').mockResolvedValue(START);

      const provider = connectAuthProvider(CONNECTOR, PARAMS, {
        consent: 'eager',
        vercelToken: 'vercel_oidc_token',
        redirectUrl: 'https://example.com/integrations',
        deviceCode: true,
      });

      await expect(provider.tokens()).rejects.toMatchObject({
        name: 'ConsentRequiredError',
        connector: CONNECTOR,
        subject: PARAMS.subject,
        url: START.url,
        request: START.request,
        verifier: START.verifier,
      });
      expect(authorization.startAuthorization).toHaveBeenCalledTimes(1);
      expect(authorization.startAuthorization).toHaveBeenCalledWith(
        CONNECTOR,
        PARAMS,
        {
          vercelToken: 'vercel_oidc_token',
          callbackUrl: 'https://example.com/integrations',
          deviceCode: true,
        }
      );
    });

    it('runs onConsentRequired and still throws so the request is aborted', async () => {
      vi.spyOn(token, 'getTokenResponse').mockRejectedValue(
        new UserAuthorizationRequiredError('user must authorize')
      );
      vi.spyOn(authorization, 'startAuthorization').mockResolvedValue(START);

      const onConsentRequired = vi.fn();
      const provider = connectAuthProvider(CONNECTOR, PARAMS, {
        consent: 'eager',
        onConsentRequired,
      });

      await expect(provider.tokens()).rejects.toBeInstanceOf(
        ConsentRequiredError
      );
      expect(onConsentRequired).toHaveBeenCalledTimes(1);
      expect(onConsentRequired.mock.calls[0]?.[0]).toMatchObject({
        url: START.url,
      });
    });

    it('lets an onConsentRequired throw (e.g. a framework redirect()) win', async () => {
      vi.spyOn(token, 'getTokenResponse').mockRejectedValue(
        new UserAuthorizationRequiredError('user must authorize')
      );
      vi.spyOn(authorization, 'startAuthorization').mockResolvedValue(START);

      const redirectSignal = new Error('NEXT_REDIRECT');
      const provider = connectAuthProvider(CONNECTOR, PARAMS, {
        consent: 'eager',
        onConsentRequired: () => {
          throw redirectSignal;
        },
      });

      await expect(provider.tokens()).rejects.toBe(redirectSignal);
    });

    it('still passes ConnectorInstallationRequiredError and other errors through', async () => {
      const start = vi.spyOn(authorization, 'startAuthorization');
      vi.spyOn(token, 'getTokenResponse').mockRejectedValue(
        new ConnectorInstallationRequiredError('install required')
      );
      const provider = connectAuthProvider(CONNECTOR, PARAMS, {
        consent: 'eager',
      });
      await expect(provider.tokens()).rejects.toBeInstanceOf(
        ConnectorInstallationRequiredError
      );

      const networkError = new Error('connect/ECONNREFUSED');
      vi.spyOn(token, 'getTokenResponse').mockRejectedValue(networkError);
      await expect(provider.tokens()).rejects.toBe(networkError);
      expect(start).not.toHaveBeenCalled();
    });

    it("defaults to 'transport' mode when consent is omitted", async () => {
      vi.spyOn(token, 'getTokenResponse').mockRejectedValue(
        new UserAuthorizationRequiredError('user must authorize')
      );
      const start = vi.spyOn(authorization, 'startAuthorization');

      expect(await connectAuthProvider(CONNECTOR, PARAMS).tokens()).toBe(
        undefined
      );
      expect(start).not.toHaveBeenCalled();
    });
  });

  describe('getConsentChallenge / isConsentRequiredError', () => {
    const challenge: ConsentChallenge = {
      connector: CONNECTOR,
      subject: PARAMS.subject,
      url: 'https://connect.vercel.com/consent',
      request: 'req',
      verifier: 'ver',
      deviceCode: 'WDJB-MJHT',
      expiresAt: 1_700_000_000_000,
    };

    it('returns the challenge for a bare ConsentRequiredError', () => {
      const err = new ConsentRequiredError(challenge);
      expect(isConsentRequiredError(err)).toBe(true);
      expect(getConsentChallenge(err)).toEqual(challenge);
    });

    it('finds the challenge through nested cause chains (MCPConnectionError-style wrappers)', () => {
      const inner = new ConsentRequiredError(challenge);
      const wrapped = new Error('Failed to connect to MCP server', {
        cause: inner,
      });
      const outer = new Error('route failed', { cause: wrapped });

      expect(isConsentRequiredError(outer)).toBe(false);
      expect(getConsentChallenge(outer)).toEqual(challenge);
    });

    it('matches structurally when instanceof fails (duplicate package copy)', () => {
      const lookalike = Object.assign(new Error('consent'), {
        name: 'ConsentRequiredError',
        connector: CONNECTOR,
        subject: PARAMS.subject,
        url: 'https://connect.vercel.com/consent',
        request: 'req',
        verifier: 'ver',
      });
      expect(isConsentRequiredError(lookalike)).toBe(false);
      expect(getConsentChallenge({ cause: lookalike })).toMatchObject({
        url: 'https://connect.vercel.com/consent',
        connector: CONNECTOR,
      });
    });

    it('returns undefined for unrelated values and errors', () => {
      expect(getConsentChallenge(undefined)).toBeUndefined();
      expect(getConsentChallenge(null)).toBeUndefined();
      expect(getConsentChallenge('nope')).toBeUndefined();
      expect(getConsentChallenge(new Error('plain'))).toBeUndefined();
      expect(
        getConsentChallenge(
          new Error('wrapped', {
            cause: new UserAuthorizationRequiredError('x'),
          })
        )
      ).toBeUndefined();
      // Missing required fields => not a challenge.
      expect(
        getConsentChallenge({ name: 'ConsentRequiredError', url: 'u' })
      ).toBeUndefined();
    });

    it('terminates on cyclic cause chains', () => {
      const a: { cause?: unknown } = {};
      const b: { cause?: unknown } = { cause: a };
      a.cause = b;
      expect(getConsentChallenge(a)).toBeUndefined();
    });
  });

  describe('ConsentRequiredError', () => {
    it('exposes the consent metadata as enumerable fields', () => {
      const err = new ConsentRequiredError({
        connector: CONNECTOR,
        subject: PARAMS.subject,
        url: 'https://connect.vercel.com/consent',
        request: 'req',
        verifier: 'ver',
      });
      expect(err.name).toBe('ConsentRequiredError');
      expect(err.connector).toBe(CONNECTOR);
      expect(err.url).toBe('https://connect.vercel.com/consent');
      expect(err.request).toBe('req');
      expect(err.verifier).toBe('ver');
      expect(err.message).toMatch(/user authorization required/i);
    });

    it('is an instanceof Error and ConsentRequiredError', () => {
      const err = new ConsentRequiredError({
        connector: CONNECTOR,
        subject: PARAMS.subject,
        url: 'u',
        request: 'r',
        verifier: 'v',
      });
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ConsentRequiredError);
    });
  });
});
