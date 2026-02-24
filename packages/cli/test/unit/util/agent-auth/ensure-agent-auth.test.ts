import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import {
  ensureAgentAuth,
  getAgentOAuthConfigKey,
} from '../../../../src/util/agent-auth/ensure-agent-auth';
import type { ProjectLinked } from '@vercel-internals/types';

describe('getAgentOAuthConfigKey', () => {
  it('returns key in projectId:orgId:agentName format', () => {
    expect(getAgentOAuthConfigKey('proj_123', 'team_abc', 'cursor')).toBe(
      'proj_123:team_abc:cursor'
    );
  });
});

describe('ensureAgentAuth', () => {
  const linkedProject: ProjectLinked = {
    status: 'linked',
    org: { type: 'team', id: 'team_1', slug: 'my-team' },
    project: {
      id: 'proj_1',
      name: 'my-project',
      accountId: 'team_1',
      updatedAt: 0,
      createdAt: 0,
    },
  };

  beforeEach(() => {
    client.reset();
    client.config = { agentOAuth: {} };
  });

  it('returns 1 when client is not an agent', async () => {
    client.isAgent = false;
    const result = await ensureAgentAuth(client, linkedProject);
    expect(result).toBe(1);
  });

  it('returns 1 when forceCreate is false and not isAgent', async () => {
    client.isAgent = false;
    const result = await ensureAgentAuth(client, linkedProject, {
      forceCreate: false,
    });
    expect(result).toBe(1);
  });

  it('returns existing valid token when agent OAuth entry exists', async () => {
    client.isAgent = true;
    client.agentName = 'cursor';
    const configKey = getAgentOAuthConfigKey(
      linkedProject.project.id,
      linkedProject.org.id,
      'cursor'
    );
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
    client.config = {
      agentOAuth: {
        [configKey]: {
          token: 'existing_agent_token',
          refreshToken: 'existing_refresh',
          expiresAt: futureExpiry,
        },
      },
    };

    const result = await ensureAgentAuth(client, linkedProject);

    expect(typeof result).toBe('object');
    if (typeof result === 'object') {
      expect(result.token).toBe('existing_agent_token');
      expect(result._configKey).toBe(configKey);
    }
  });

  it('returns 1 when no user token and no agent token (agent context)', async () => {
    client.isAgent = true;
    client.agentName = 'cursor';
    client.authConfig = {};

    const result = await ensureAgentAuth(client, linkedProject);

    expect(result).toBe(1);
  });
});
