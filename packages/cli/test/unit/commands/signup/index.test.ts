import { beforeEach, describe, expect, it, vi } from 'vitest';
import signup from '../../../../src/commands/signup';
import { client } from '../../../mocks/client';
import * as loginFuture from '../../../../src/commands/login/future';
import { getSignupVerificationUrl } from '../../../../src/commands/login/future';
import _fetch, { type Response } from '../../../../src/util/fetch';
import { Headers } from '../../../../src/util/fetch-primitives';
import * as open from 'open';

const fetch = vi.mocked(_fetch);
vi.mock('../../../../src/util/fetch', async () => ({
  ...(await vi.importActual('../../../../src/util/fetch')),
  default: vi.fn(),
}));

vi.mock('open', () => {
  return {
    default: vi.fn().mockResolvedValue(undefined),
  };
});

vi.setConfig({ testTimeout: 10000 });

function mockResponse(data: unknown, ok = true): Response {
  return {
    ok,
    clone: () => ({ text: async () => 'called in debug output' }),
    json: async () => data,
  } as unknown as Response;
}

function mockJsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({
      'content-type': 'application/json; charset=utf-8',
    }),
    clone: () => ({ text: async () => 'mock json response' }),
    json: async () => data,
  } as unknown as Response;
}

const authorizationResult = {
  device_code: 'device_code_123',
  user_code: 'ABCD-EFGH',
  verification_uri: 'https://vercel.com/device',
  verification_uri_complete:
    'https://vercel.com/oauth/device?user_code=ABCD-EFGH',
  expires_in: 30,
  interval: 0.005,
};

const tokenResult = {
  access_token: 'vca_new_account',
  token_type: 'Bearer' as const,
  expires_in: 3600,
  refresh_token: 'vcr_new_account',
  scope: 'openid offline_access',
};

function mockSuccessfulDeviceFlow() {
  fetch.mockImplementation(async (url, init) => {
    if (!init?.body) {
      if (String(url).endsWith('/v2/user')) {
        return mockJsonResponse({
          user: {
            id: 'user_new',
            username: 'new-user',
            version: 'northstar',
            defaultTeamId: 'team_new',
          },
        });
      }
      return mockResponse({
        issuer: 'https://vercel.com',
        device_authorization_endpoint: 'https://vercel.com',
        token_endpoint: 'https://vercel.com',
        revocation_endpoint: 'https://vercel.com',
        jwks_uri: 'https://vercel.com',
        introspection_endpoint: 'https://vercel.com',
      });
    }
    const body = init.body?.toString();
    if (
      body?.includes(
        'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code'
      )
    ) {
      return mockResponse(tokenResult);
    }
    return mockResponse(authorizationResult);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(open.default).mockResolvedValue({ on: vi.fn() } as never);
  client.stdin.isTTY = true;
  client.isAgent = false;
  client.nonInteractive = false;
});

describe('getSignupVerificationUrl', () => {
  it('prefills the email and redirects back to the device page', () => {
    const url = new URL(
      getSignupVerificationUrl(
        'https://vercel.com/oauth/device?user_code=ABCD-EFGH',
        'new@example.com'
      )
    );
    expect(url.origin).toBe('https://vercel.com');
    expect(url.pathname).toBe('/signup');
    expect(url.searchParams.get('email')).toBe('new@example.com');
    expect(url.searchParams.get('next')).toBe(
      '/oauth/device?user_code=ABCD-EFGH'
    );
  });
});

describe('signup', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('signup', '--help');
      await expect(signup(client)).resolves.toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'signup' },
      ]);
    });
  });

  it('should not allow the `--token` flag', async () => {
    client.setArgv('signup', '--token', 'foo');
    const exitCodePromise = signup(client);
    await expect(client.stderr).toOutput(
      'Error: `--token` may not be used with the "signup" command\n'
    );
    expect(await exitCodePromise).toEqual(2);
  });

  it('rejects an invalid email option', async () => {
    client.setArgv('signup', '--email', 'not-an-email');
    const exitCodePromise = signup(client);
    await expect(client.stderr).toOutput('not a valid email address');
    expect(await exitCodePromise).toEqual(2);
  });

  it('returns a structured error for an invalid email in non-interactive mode', async () => {
    client.setArgv('signup', '--email', 'not-an-email');
    client.nonInteractive = true;

    expect(await signup(client)).toEqual(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message: 'The value provided for --email is not a valid email address.',
    });
  });

  it('returns a structured error for an unknown flag in non-interactive mode', async () => {
    client.setArgv('signup', '--non-interactive', '--emial', 'new@example.com');

    expect(await signup(client)).toEqual(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      suggestedOption: '--email',
    });
  });

  it('rejects a positional email argument', async () => {
    client.setArgv('signup', 'new@example.com');
    const exitCodePromise = signup(client);
    await expect(client.stderr).toOutput('Too many arguments');
    expect(await exitCodePromise).toEqual(2);
  });

  it('requires the email option in non-interactive mode', async () => {
    client.setArgv('signup');
    client.nonInteractive = true;
    const textSpy = vi.spyOn(client.input, 'text');
    const exitCodePromise = signup(client);
    await expect(client.stderr).toOutput('Provide an email address with');
    expect(await exitCodePromise).toEqual(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'missing_arguments',
      message: 'Provide an email address with --email.',
    });
    expect(textSpy).not.toHaveBeenCalled();
  });

  it('requires the email option when stdin is not a TTY', async () => {
    client.setArgv('signup');
    client.stdin.isTTY = false;
    const textSpy = vi.spyOn(client.input, 'text');
    const exitCodePromise = signup(client);
    await expect(client.stderr).toOutput('Provide an email address with');
    expect(await exitCodePromise).toEqual(2);
    expect(textSpy).not.toHaveBeenCalled();
  });

  it('opens the signup page with the email and device code, then saves the tokens', async () => {
    const previousCi = process.env.CI;
    delete process.env.CI;

    try {
      mockSuccessfulDeviceFlow();

      client.setArgv('signup', '--email', 'new@example.com');
      delete client.authConfig.token;
      client.config.currentTeam = undefined;

      const exitCodePromise = signup(client);
      await expect(client.stderr).toOutput('Welcome to Vercel!');
      expect(await exitCodePromise).toEqual(0);

      const output = client.getFullOutput();
      expect(output).toContain('new@example.com');
      expect(output).toContain('ABCD-EFGH');
      expect(output).toContain('device code');
      expect(output).toContain(
        'Run `vercel deploy` to deploy, or `vercel setup` to set up the Vercel plugin and connect your coding agents to AI Gateway.'
      );
      expect(output).not.toContain('To deploy something, run `vercel`.');

      expect(open.default).toHaveBeenCalledWith(
        getSignupVerificationUrl(
          authorizationResult.verification_uri_complete,
          'new@example.com'
        )
      );

      expect(client.authConfig.token).toBe(tokenResult.access_token);
      expect(client.authConfig.refreshToken).toBe(tokenResult.refresh_token);
      expect(client.config.currentTeam).toBe('team_new');

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:email', value: '[REDACTED]' },
        { key: expect.stringMatching(/^login:attempt:/), value: 'started' },
        { key: expect.stringMatching(/^login:attempt:/), value: 'success' },
      ]);
    } finally {
      if (previousCi === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = previousCi;
      }
    }
  });

  it('prompts for the email when it is not provided', async () => {
    const flowSpy = vi
      .spyOn(loginFuture, 'performDeviceCodeFlow')
      .mockResolvedValue({
        access_token: 'vca_prompted',
        expires_in: 3600,
        refresh_token: 'vcr_prompted',
      });
    const saveSpy = vi
      .spyOn(loginFuture, 'saveDeviceCodeTokens')
      .mockResolvedValue(undefined);

    try {
      client.setArgv('signup');
      const exitCodePromise = signup(client);

      await expect(client.stderr).toOutput('Email?');
      client.stdin.write('prompted@example.com\n');

      expect(await exitCodePromise).toEqual(0);
      expect(flowSpy).toHaveBeenCalledWith(client, {
        signupEmail: 'prompted@example.com',
      });
      expect(saveSpy).toHaveBeenCalledTimes(1);
    } finally {
      flowSpy.mockRestore();
      saveSpy.mockRestore();
    }
  });

  it('returns 1 when the device flow fails', async () => {
    const flowSpy = vi
      .spyOn(loginFuture, 'performDeviceCodeFlow')
      .mockResolvedValue(null);

    try {
      client.setArgv('signup', '--email', 'new@example.com');
      expect(await signup(client)).toEqual(1);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:email', value: '[REDACTED]' },
        { key: expect.stringMatching(/^login:attempt:/), value: 'started' },
        { key: expect.stringMatching(/^login:attempt:/), value: 'error' },
      ]);
    } finally {
      flowSpy.mockRestore();
    }
  });
});
