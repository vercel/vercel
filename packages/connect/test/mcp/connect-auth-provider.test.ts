import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectAuthProvider,
  ConsentRequiredError,
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
    it('reports the configured redirectUrl (empty string by default)', () => {
      expect(connectAuthProvider(CONNECTOR, PARAMS).redirectUrl).toBe('');
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

    it('throws when codeVerifier() is called (Connect owns PKCE server-side)', () => {
      const provider = connectAuthProvider(CONNECTOR, PARAMS);
      expect(() => provider.codeVerifier()).toThrowError(
        /codeVerifier\(\) is unsupported/
      );
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
