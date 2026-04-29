import { beforeEach, describe, expect, it, vi } from 'vitest';
import logout from '../../../../src/commands/logout';
import { client } from '../../../mocks/client';
import {
  persistAuthConfig,
  writeToConfigFile,
} from '../../../../src/util/config/files';

vi.mock('../../../../src/util/config/files', async () => {
  const actual = await vi.importActual('../../../../src/util/config/files');

  return {
    ...actual,
    persistAuthConfig: vi.fn(),
    writeToConfigFile: vi.fn(),
  };
});

describe('logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
  });

  it('tracks telemetry for --help', async () => {
    client.setArgv('logout', '--help');

    const exitCode = await logout(client);

    expect(exitCode).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'flag:help',
        value: 'logout',
      },
    ]);
  });

  it('clears persisted auth state during legacy logout', async () => {
    client.scenario.delete('/v3/user/tokens/current', (_req, res) => {
      res.status(200).json({});
    });

    client.setArgv('logout');
    client.authConfig = {
      token: 'token_123',
      userId: 'user_123',
    };
    client.config = {
      currentTeam: 'team_123',
    };

    const exitCode = await logout(client);

    expect(exitCode).toBe(0);
    expect(writeToConfigFile).toHaveBeenCalledWith({});
    expect(persistAuthConfig).toHaveBeenCalledWith({}, {});
  });

  it('fails logout when clearing persisted auth state fails', async () => {
    client.scenario.delete('/v3/user/tokens/current', (_req, res) => {
      res.status(200).json({});
    });

    vi.mocked(persistAuthConfig).mockImplementation(() => {
      throw new Error('keyring delete failed');
    });

    client.setArgv('logout', '--debug');
    client.authConfig = {
      token: 'token_123',
      userId: 'user_123',
    };
    client.config = {
      currentTeam: 'team_123',
    };

    const exitCode = await logout(client);

    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('Failed during logout');
  });

  it('does not persist config changes for explicit-token logout', async () => {
    client.scenario.delete('/v3/user/tokens/current', (_req, res) => {
      res.status(200).json({});
    });

    client.setArgv('logout');
    client.authConfig = {
      token: 'token_123',
      userId: 'user_123',
      skipWrite: true,
      tokenSource: 'flag',
    };
    client.config = {
      currentTeam: 'team_123',
    };

    const exitCode = await logout(client);

    expect(exitCode).toBe(0);
    expect(writeToConfigFile).not.toHaveBeenCalled();
    expect(persistAuthConfig).not.toHaveBeenCalled();
  });
});
