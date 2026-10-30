import type { GlobalConfig } from '@vercel-internals/types';
import {
  readGlobalConfigFile,
  writeGlobalConfigFile,
} from '@vercel/cli-config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { getConfigFilePath } from '../../../../src/util/config/files';
import {
  TEAM_SLUG_TTL_MS,
  forgetCachedTeamSlug,
  getCachedTeamSlug,
  setCachedTeamSlug,
} from '../../../../src/util/teams/team-name-cache';

vi.unmock('../../../../src/util/teams/team-name-cache');

vi.mock('@vercel/cli-config', async importOriginal => ({
  ...(await importOriginal<typeof import('@vercel/cli-config')>()),
  readGlobalConfigFile: vi.fn(),
  writeGlobalConfigFile: vi.fn(),
}));

const readConfigMock = vi.mocked(readGlobalConfigFile);
const writeConfigMock = vi.mocked(writeGlobalConfigFile);

const NOW = Date.UTC(2026, 8, 30, 12);

type ConfigWithSlugs = GlobalConfig & {
  cachedTeamSlugs?: Record<string, unknown>;
};

function saved(slug: string, savedAt = NOW) {
  return { slug, savedAt };
}

describe('team name cache', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    readConfigMock.mockReset().mockReturnValue({});
    writeConfigMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('getCachedTeamSlug', () => {
    it('returns the slug saved for the team id', () => {
      const config: ConfigWithSlugs = {
        cachedTeamSlugs: { team_a: saved('acme') },
      };

      expect(getCachedTeamSlug(config, 'team_a')).toBe('acme');
      expect(getCachedTeamSlug(config, 'team_b')).toBeUndefined();
      expect(getCachedTeamSlug({}, 'team_a')).toBeUndefined();
    });

    it('returns the slug until it expires', () => {
      const config: ConfigWithSlugs = {
        cachedTeamSlugs: { team_a: saved('acme') },
      };

      expect(
        getCachedTeamSlug(config, 'team_a', NOW + TEAM_SLUG_TTL_MS - 1)
      ).toBe('acme');
      expect(
        getCachedTeamSlug(config, 'team_a', NOW + TEAM_SLUG_TTL_MS)
      ).toBeUndefined();
    });

    it('ignores an entry saved in the future', () => {
      const config: ConfigWithSlugs = {
        cachedTeamSlugs: { team_a: saved('acme', NOW + 1000) },
      };

      expect(getCachedTeamSlug(config, 'team_a')).toBeUndefined();
    });

    it.each([
      ['a plain string', 'acme'],
      ['a missing timestamp', { slug: 'acme' }],
      ['a non-string slug', { slug: 42, savedAt: NOW }],
      ['null', null],
    ])('ignores an entry that is %s', (_label, entry) => {
      const config: ConfigWithSlugs = { cachedTeamSlugs: { team_a: entry } };

      expect(getCachedTeamSlug(config, 'team_a')).toBeUndefined();
    });
  });

  describe('setCachedTeamSlug', () => {
    it('saves only the slug, not invocation overrides', () => {
      const savedConfig = {
        currentTeam: 'team_saved',
        unknownSetting: { preserve: true },
      };
      readConfigMock.mockReturnValue(savedConfig);
      client.config = {
        currentTeam: 'team_invocation',
        api: 'https://invocation.example.com',
      };

      setCachedTeamSlug(client, 'team_invocation', 'invocation-team');

      expect(writeConfigMock).toHaveBeenCalledExactlyOnceWith(
        getConfigFilePath(),
        {
          ...savedConfig,
          cachedTeamSlugs: { team_invocation: saved('invocation-team') },
        }
      );
      expect(client.config).toEqual({
        currentTeam: 'team_invocation',
        api: 'https://invocation.example.com',
        cachedTeamSlugs: { team_invocation: saved('invocation-team') },
      });
    });

    it('keeps slugs saved for other teams', () => {
      readConfigMock.mockReturnValue({
        cachedTeamSlugs: { team_a: saved('acme') },
      } as ConfigWithSlugs);

      setCachedTeamSlug(client, 'team_b', 'globex');

      expect(writeConfigMock).toHaveBeenCalledExactlyOnceWith(
        getConfigFilePath(),
        { cachedTeamSlugs: { team_a: saved('acme'), team_b: saved('globex') } }
      );
    });

    it('does not write when the same slug is saved and not expired', () => {
      client.config = {
        cachedTeamSlugs: { team_a: saved('acme') },
      } as ConfigWithSlugs;

      setCachedTeamSlug(client, 'team_a', 'acme');

      expect(readConfigMock).not.toHaveBeenCalled();
      expect(writeConfigMock).not.toHaveBeenCalled();
    });

    it('refreshes the timestamp of an expired entry with the same slug', () => {
      const expired = saved('acme', NOW - TEAM_SLUG_TTL_MS);
      readConfigMock.mockReturnValue({
        cachedTeamSlugs: { team_a: expired },
      } as ConfigWithSlugs);
      client.config = {
        cachedTeamSlugs: { team_a: expired },
      } as ConfigWithSlugs;

      setCachedTeamSlug(client, 'team_a', 'acme');

      expect(writeConfigMock).toHaveBeenCalledExactlyOnceWith(
        getConfigFilePath(),
        { cachedTeamSlugs: { team_a: saved('acme') } }
      );
    });

    it('replaces the slug of a renamed team', () => {
      readConfigMock.mockReturnValue({
        cachedTeamSlugs: { team_a: saved('acme') },
      } as ConfigWithSlugs);
      client.config = {
        cachedTeamSlugs: { team_a: saved('acme') },
      } as ConfigWithSlugs;

      setCachedTeamSlug(client, 'team_a', 'acme-renamed');

      expect(writeConfigMock).toHaveBeenCalledExactlyOnceWith(
        getConfigFilePath(),
        { cachedTeamSlugs: { team_a: saved('acme-renamed') } }
      );
    });

    it('ignores a config file that cannot be written', () => {
      writeConfigMock.mockImplementation(() => {
        throw new Error('EACCES');
      });

      expect(() => setCachedTeamSlug(client, 'team_a', 'acme')).not.toThrow();
      expect(getCachedTeamSlug(client.config, 'team_a')).toBeUndefined();
    });
  });

  describe('forgetCachedTeamSlug', () => {
    it('removes only the given team', () => {
      const cachedTeamSlugs = {
        team_a: saved('acme'),
        team_b: saved('globex'),
      };
      readConfigMock.mockReturnValue({ cachedTeamSlugs } as ConfigWithSlugs);
      client.config = { cachedTeamSlugs } as ConfigWithSlugs;

      forgetCachedTeamSlug(client, 'team_a');

      expect(writeConfigMock).toHaveBeenCalledExactlyOnceWith(
        getConfigFilePath(),
        { cachedTeamSlugs: { team_b: saved('globex') } }
      );
      expect(getCachedTeamSlug(client.config, 'team_a')).toBeUndefined();
      expect(getCachedTeamSlug(client.config, 'team_b')).toBe('globex');
    });

    it('removes an expired entry', () => {
      const cachedTeamSlugs = { team_a: saved('acme', 0) };
      readConfigMock.mockReturnValue({ cachedTeamSlugs } as ConfigWithSlugs);
      client.config = { cachedTeamSlugs } as ConfigWithSlugs;

      forgetCachedTeamSlug(client, 'team_a');

      expect(writeConfigMock).toHaveBeenCalledExactlyOnceWith(
        getConfigFilePath(),
        { cachedTeamSlugs: {} }
      );
    });

    it('does not write when nothing is saved for the team', () => {
      forgetCachedTeamSlug(client, 'team_a');

      expect(readConfigMock).not.toHaveBeenCalled();
      expect(writeConfigMock).not.toHaveBeenCalled();
    });
  });
});
