import { afterEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import * as configFilesUtil from '../../../../src/util/config/files';
import {
  getCachedScopeTeamId,
  setCachedScopeTeamId,
  type GlobalConfigWithScopeCache,
} from '../../../../src/util/teams/scope-team-cache';

const withCache = (
  cachedTeamIds: GlobalConfigWithScopeCache['cachedTeamIds']
): GlobalConfigWithScopeCache => ({ cachedTeamIds });

describe('scope-team-cache', () => {
  afterEach(() => {
    client.reset();
    vi.restoreAllMocks();
  });

  it('returns undefined when no cache exists', () => {
    expect(getCachedScopeTeamId({}, 'my-team')).toBeUndefined();
  });

  it('returns undefined for an uncached scope', () => {
    expect(
      getCachedScopeTeamId(withCache({ 'other-team': 'team_other' }), 'my-team')
    ).toBeUndefined();
  });

  it('returns the cached team id for a scope', () => {
    expect(
      getCachedScopeTeamId(withCache({ 'my-team': 'team_mine' }), 'my-team')
    ).toBe('team_mine');
  });

  it('caches a resolution and persists the config', () => {
    const write = vi
      .spyOn(configFilesUtil, 'writeToConfigFile')
      .mockImplementation(() => {});
    (client.config as GlobalConfigWithScopeCache).cachedTeamIds = {
      'other-team': 'team_other',
    };

    setCachedScopeTeamId(client, 'my-team', 'team_mine', 'team_persisted');

    expect(write).toHaveBeenCalledTimes(1);
    expect(
      (write.mock.calls[0][0] as GlobalConfigWithScopeCache).cachedTeamIds
    ).toEqual({
      'other-team': 'team_other',
      'my-team': 'team_mine',
    });
  });

  it('persists the pre-scope currentTeam, not the invocation override', () => {
    const write = vi
      .spyOn(configFilesUtil, 'writeToConfigFile')
      .mockImplementation(() => {});
    client.config.currentTeam = 'team_scoped_this_invocation';

    setCachedScopeTeamId(client, 'my-team', 'team_mine', 'team_persisted');

    expect(write.mock.calls[0][0].currentTeam).toBe('team_persisted');
    expect(client.config.currentTeam).toBe('team_scoped_this_invocation');
  });

  it('drops currentTeam from disk when none was persisted', () => {
    const write = vi
      .spyOn(configFilesUtil, 'writeToConfigFile')
      .mockImplementation(() => {});
    client.config.currentTeam = 'team_scoped_this_invocation';

    setCachedScopeTeamId(client, 'my-team', 'team_mine', undefined);

    expect(write.mock.calls[0][0].currentTeam).toBeUndefined();
    expect(JSON.stringify(write.mock.calls[0][0])).not.toContain('currentTeam');
  });

  it('does not rewrite the config when the resolution is unchanged', () => {
    const write = vi
      .spyOn(configFilesUtil, 'writeToConfigFile')
      .mockImplementation(() => {});
    (client.config as GlobalConfigWithScopeCache).cachedTeamIds = {
      'my-team': 'team_mine',
    };

    setCachedScopeTeamId(client, 'my-team', 'team_mine', 'team_persisted');

    expect(write).not.toHaveBeenCalled();
  });

  it('overwrites a stale resolution', () => {
    const write = vi
      .spyOn(configFilesUtil, 'writeToConfigFile')
      .mockImplementation(() => {});
    (client.config as GlobalConfigWithScopeCache).cachedTeamIds = {
      'my-team': 'team_stale',
    };

    setCachedScopeTeamId(client, 'my-team', 'team_mine', 'team_persisted');

    expect(
      (client.config as GlobalConfigWithScopeCache).cachedTeamIds?.['my-team']
    ).toBe('team_mine');
    expect(write).toHaveBeenCalledTimes(1);
  });
});
