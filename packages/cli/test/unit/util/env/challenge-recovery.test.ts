import { beforeEach, describe, expect, it, vi } from 'vitest';
import { performDeviceCodeFlow } from '../../../../src/commands/login/future';
import { withEnvChallengeRecovery } from '../../../../src/util/env/challenge-recovery';
import { client } from '../../../mocks/client';

vi.mock('../../../../src/commands/login/future', () => ({
  performDeviceCodeFlow: vi.fn(),
}));

function challengeError(
  code: string,
  wwwAuthenticate?: string
): Error & {
  status: number;
  code: string;
  wwwAuthenticate?: string;
} {
  return Object.assign(new Error('Challenge required'), {
    status: 403,
    code,
    wwwAuthenticate,
  });
}

const stepUpHeader =
  'Bearer error="insufficient_user_authentication", acr_values="urn:vercel:loa:sudo"';

beforeEach(() => {
  vi.resetAllMocks();
  client.authConfig = {
    token: 'vca_old',
    refreshToken: 'vcr_old',
  };
  client.stdin.isTTY = true;
  client.nonInteractive = false;
});

describe('withEnvChallengeRecovery', () => {
  it('uses step-up authentication when the challenge includes an ACR value', async () => {
    const error = challengeError('challenge_required', stepUpHeader);
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('retried');
    vi.mocked(performDeviceCodeFlow).mockResolvedValueOnce({
      access_token: 'vca_new',
      expires_in: 3600,
      refresh_token: 'vcr_new',
    });

    await expect(withEnvChallengeRecovery(client, fn)).resolves.toBe('retried');

    expect(performDeviceCodeFlow).toHaveBeenCalledWith(client, {
      refreshToken: 'vcr_old',
      acrValues: 'urn:vercel:loa:sudo',
      fallbackToLoginOnStepUpFailure: true,
    });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(client.authConfig).toMatchObject({
      token: 'vca_new',
      refreshToken: 'vcr_new',
    });
  });

  it.each([
    ['a challenge without an ACR header', 'challenge_required', undefined],
    ['an email OTP challenge', 'challenge_required_email_otp', undefined],
    ['a user authentication challenge', 'user_auth_required', undefined],
    [
      'a challenge without a stored refresh token',
      'challenge_required',
      stepUpHeader,
    ],
  ])('starts a full device login for %s', async (_name, code, header) => {
    if (_name === 'a challenge without a stored refresh token') {
      delete client.authConfig.refreshToken;
    }
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(challengeError(code, header))
      .mockResolvedValueOnce('retried');
    vi.mocked(performDeviceCodeFlow).mockResolvedValueOnce({
      access_token: 'vca_new',
      expires_in: 3600,
      refresh_token: 'vcr_new',
    });

    await expect(withEnvChallengeRecovery(client, fn)).resolves.toBe('retried');

    expect(performDeviceCodeFlow).toHaveBeenCalledWith(client);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(client.authConfig).toMatchObject({
      token: 'vca_new',
      refreshToken: 'vcr_new',
    });
  });

  it('starts a full device login for a rejected stored token', async () => {
    const error = Object.assign(new Error('Not authorized'), {
      status: 403,
      code: 'forbidden',
      invalidToken: true,
    });
    const fn = vi.fn<() => Promise<string>>().mockRejectedValueOnce(error);
    fn.mockResolvedValueOnce('retried');
    vi.mocked(performDeviceCodeFlow).mockResolvedValueOnce({
      access_token: 'vca_new',
      expires_in: 3600,
      refresh_token: 'vcr_new',
    });

    await expect(withEnvChallengeRecovery(client, fn)).resolves.toBe('retried');

    expect(performDeviceCodeFlow).toHaveBeenCalledWith(client);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(client.authConfig).toMatchObject({
      token: 'vca_new',
      refreshToken: 'vcr_new',
    });
  });

  it('does not start a second login after an earlier refresh attempt cleared the session', async () => {
    const error = Object.assign(new Error('Not authorized'), {
      status: 403,
      code: 'forbidden',
      missingToken: true,
    });
    const fn = vi.fn<() => Promise<string>>().mockImplementationOnce(() => {
      client.authConfig = {};
      return Promise.reject(error);
    });

    await expect(withEnvChallengeRecovery(client, fn)).rejects.toBe(error);

    expect(performDeviceCodeFlow).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not start browser authentication when no stored session existed', async () => {
    client.authConfig = {};
    const error = Object.assign(new Error('Not authorized'), {
      status: 403,
      code: 'forbidden',
      missingToken: true,
    });
    const fn = vi.fn<() => Promise<string>>().mockRejectedValueOnce(error);

    await expect(withEnvChallengeRecovery(client, fn)).rejects.toBe(error);

    expect(performDeviceCodeFlow).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'a --token value',
      () => {
        client.authConfig.tokenSource = 'flag';
      },
    ],
    [
      'a VERCEL_TOKEN value',
      () => {
        client.authConfig.tokenSource = 'env';
      },
    ],
    [
      'non-TTY stdin',
      () => {
        client.stdin.isTTY = false;
      },
    ],
    [
      '--non-interactive',
      () => {
        client.nonInteractive = true;
      },
    ],
  ])('does not start browser authentication for %s', async (_name, setup) => {
    setup();
    const error = challengeError('challenge_required', stepUpHeader);
    const fn = vi.fn<() => Promise<string>>().mockRejectedValueOnce(error);

    await expect(withEnvChallengeRecovery(client, fn)).rejects.toBe(error);

    expect(performDeviceCodeFlow).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not recover unrelated API errors', async () => {
    const error = challengeError('token_type_not_allowed');
    const fn = vi.fn<() => Promise<string>>().mockRejectedValueOnce(error);

    await expect(withEnvChallengeRecovery(client, fn)).rejects.toBe(error);

    expect(performDeviceCodeFlow).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('rethrows the challenge when authentication is not completed', async () => {
    const error = challengeError('challenge_required', stepUpHeader);
    const fn = vi.fn<() => Promise<string>>().mockRejectedValueOnce(error);
    vi.mocked(performDeviceCodeFlow).mockResolvedValueOnce(null);

    await expect(withEnvChallengeRecovery(client, fn)).rejects.toBe(error);

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
