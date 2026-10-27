import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { APIError } from '../../../../src/util/errors-ts';
import {
  isDirectoryCursor,
  isDirectoryEnabledByEnv,
  isDirectoryUnavailable,
  listDirectoryKeysPage,
  resolveDirectoryIdentities,
  resolveDirectoryKeyQuotas,
  toApiKey,
  type DirectoryKeyMetadata,
} from '../../../../src/util/ai-gateway/directory';

const generation = { id: 'keys-v1-g1', status: 'serving', shadow: false };

const key: DirectoryKeyMetadata = {
  schemaVersion: 1,
  keyId: 'key_1',
  teamId: 'team_abc',
  createdBy: 'user_1',
  name: 'production',
  suffix: 't7V',
  state: 'active',
  createdAt: 1700000000000,
  lastActiveAt: 1700000100000,
  attribution: { issuanceMethod: 'cli', createdByAppId: 'app_1' },
};

function apiError(status: number, body: object = {}) {
  const headers = new Headers();
  return new APIError('boom', { status, headers } as unknown as Response, body);
}

function encodeCursor(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('ai-gateway directory client', () => {
  function setup() {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    return team;
  }

  describe('listDirectoryKeysPage', () => {
    it('passes every filter and scopes the request to the team', async () => {
      const team = setup();
      let query: Record<string, unknown> = {};
      client.scenario.get('/ai-gateway/directory/keys', (req, res) => {
        query = req.query as Record<string, unknown>;
        res.json({
          schemaVersion: 1,
          data: [key],
          cursor: 'c2',
          complete: false,
          meta: { generation },
        });
      });

      const page = await listDirectoryKeysPage(client, {
        search: '  prod ',
        createdBy: 'user_1',
        state: 'active',
        sort: 'name:asc',
        cursor: 'c1',
        limit: 5,
      });

      expect(page.items).toEqual([key]);
      expect(page.next).toBe('c2');
      expect(query).toEqual({
        search: 'prod',
        createdBy: 'user_1',
        state: 'active',
        sort: 'name:asc',
        cursor: 'c1',
        limit: '5',
        teamId: team.id,
      });
    });

    it('omits a blank search and returns null at the last page', async () => {
      setup();
      let query: Record<string, unknown> = {};
      client.scenario.get('/ai-gateway/directory/keys', (req, res) => {
        query = req.query as Record<string, unknown>;
        res.json({
          schemaVersion: 1,
          data: [],
          cursor: null,
          complete: true,
          meta: { generation },
        });
      });

      const page = await listDirectoryKeysPage(client, { search: '   ' });

      expect(page).toEqual({ items: [], next: null });
      expect(query).not.toHaveProperty('search');
    });

    it('fails on the first 429 instead of waiting out Retry-After', async () => {
      setup();
      let calls = 0;
      client.scenario.get('/ai-gateway/directory/keys', (_req, res) => {
        calls += 1;
        res
          .status(429)
          .set('Retry-After', '60')
          .json({
            error: { code: 'rate_limited', message: 'Too many requests.' },
          });
      });

      const err = await listDirectoryKeysPage(client).catch(e => e);

      expect(isDirectoryUnavailable(err)).toBe(true);
      expect(calls).toBe(1);
    });
  });

  describe('resolveDirectoryIdentities', () => {
    it('dedupes ids, splits requests at 100, and maps users and keys', async () => {
      setup();
      const bodies: Record<string, unknown>[] = [];
      client.scenario.post(
        '/ai-gateway/directory/identities/resolve',
        (req, res) => {
          bodies.push(req.body);
          const keyIds: string[] = req.body.keyIds ?? [];
          const userIds: string[] = req.body.userIds ?? [];
          res.json({
            schemaVersion: 1,
            data: {
              keys: keyIds.slice(0, 1).map(id => ({ ...key, keyId: id })),
              users: userIds.map(uid => ({ uid, username: `u-${uid}` })),
              missing: { keyIds: keyIds.slice(1), userIds: [] },
            },
            cursor: null,
            complete: true,
            meta: { generation },
          });
        }
      );
      const keyIds = Array.from({ length: 150 }, (_, i) => `key_${i}`);

      const resolved = await resolveDirectoryIdentities(client, {
        keyIds: [...keyIds, 'key_0'],
        userIds: ['user_a', 'user_a', 'user_b'],
      });

      expect(bodies).toHaveLength(2);
      expect(bodies[0].keyIds).toHaveLength(100);
      expect(bodies[0].userIds).toEqual(['user_a', 'user_b']);
      expect(bodies[1].keyIds).toHaveLength(50);
      expect(bodies[1]).not.toHaveProperty('userIds');
      expect([...resolved.keys.keys()]).toEqual(['key_0', 'key_100']);
      expect(resolved.users?.get('user_b')?.username).toBe('u-user_b');
    });

    it('keeps a few chunks in flight instead of serialising them', async () => {
      setup();
      let inFlight = 0;
      let peak = 0;
      client.scenario.post(
        '/ai-gateway/directory/identities/resolve',
        async (_req, res) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise(resolve => setTimeout(resolve, 20));
          inFlight -= 1;
          res.json({
            schemaVersion: 1,
            data: { keys: [], users: [], missing: { keyIds: [], userIds: [] } },
            cursor: null,
            complete: true,
            meta: { generation },
          });
        }
      );

      await resolveDirectoryIdentities(client, {
        keyIds: Array.from({ length: 1000 }, (_, i) => `key_${i}`),
      });

      expect(peak).toBeGreaterThan(1);
      expect(peak).toBeLessThanOrEqual(4);
    });

    it('reports users as null when the API cannot label them', async () => {
      setup();
      client.scenario.post(
        '/ai-gateway/directory/identities/resolve',
        (_req, res) => {
          res.json({
            schemaVersion: 1,
            data: {
              keys: [],
              users: {
                error: { code: 'user_labels_unavailable', message: 'nope' },
              },
              missing: { keyIds: [], userIds: null },
            },
            cursor: null,
            complete: true,
            meta: { generation },
          });
        }
      );

      const resolved = await resolveDirectoryIdentities(client, {
        userIds: ['user_a'],
      });

      expect(resolved.users).toBeNull();
    });
  });

  describe('resolveDirectoryKeyQuotas', () => {
    it('keys budgets by apiKeyId', async () => {
      setup();
      client.scenario.post('/ai-gateway/directory/keys/quotas', (req, res) => {
        res.json({
          schemaVersion: 1,
          data: {
            quotas: [
              {
                apiKeyId: req.body.keyIds[0],
                quotaEntityId: 'q1',
                limitAmount: 10,
                currentSpend: 1,
                currentByokSpend: 0,
                includeByokInQuota: false,
                refreshPeriod: 'monthly',
                active: true,
                archived: false,
                createdAt: 1,
                updatedAt: 2,
              },
            ],
            missing: { keyIds: [] },
          },
          cursor: null,
          complete: true,
          meta: { generation },
        });
      });

      const quotas = await resolveDirectoryKeyQuotas(client, [
        'key_1',
        'key_2',
      ]);

      expect(quotas.get('key_1')?.limitAmount).toBe(10);
      expect(quotas.has('key_2')).toBe(false);
    });
  });

  describe('isDirectoryUnavailable', () => {
    it('is true for server errors and rate limits only', () => {
      expect(isDirectoryUnavailable(apiError(503))).toBe(true);
      expect(isDirectoryUnavailable(apiError(504))).toBe(true);
      expect(isDirectoryUnavailable(apiError(429))).toBe(true);
      expect(isDirectoryUnavailable(apiError(400))).toBe(false);
      expect(isDirectoryUnavailable(apiError(403))).toBe(false);
      expect(isDirectoryUnavailable(new Error('socket hang up'))).toBe(false);
    });
  });

  describe('isDirectoryCursor', () => {
    it('recognises fingerprinted directory cursors only', () => {
      expect(
        isDirectoryCursor(
          encodeCursor({ v: 1, fp: 'abc', sa: [1700000000000, 'key_1'] })
        )
      ).toBe(true);
      expect(isDirectoryCursor('1700000000000')).toBe(false);
      expect(isDirectoryCursor(encodeCursor({ v: 2 }))).toBe(false);
      expect(isDirectoryCursor('not base64 json!')).toBe(false);
    });
  });

  describe('isDirectoryEnabledByEnv', () => {
    it('is on unless the kill switch is 0 or false', () => {
      expect(isDirectoryEnabledByEnv({})).toBe(true);
      expect(
        isDirectoryEnabledByEnv({ VERCEL_AI_GATEWAY_DIRECTORY: '1' })
      ).toBe(true);
      expect(
        isDirectoryEnabledByEnv({ VERCEL_AI_GATEWAY_DIRECTORY: ' 0 ' })
      ).toBe(false);
      expect(
        isDirectoryEnabledByEnv({ VERCEL_AI_GATEWAY_DIRECTORY: 'FALSE' })
      ).toBe(false);
    });
  });

  describe('toApiKey', () => {
    it('projects metadata onto the /v1/api-keys shape', () => {
      expect(toApiKey(key)).toEqual({
        id: 'key_1',
        name: 'production',
        partialKey: 't7V',
        teamId: 'team_abc',
        purpose: 'ai-gateway',
        projectId: null,
        expiresAt: null,
        activeAt: 1700000100000,
        createdAt: 1700000000000,
        createdBy: 'user_1',
        leakedAt: null,
        leakedUrl: null,
        createdByAppId: 'app_1',
      });
    });

    it('fills absent fields and strips the quota join key', () => {
      const legacy: DirectoryKeyMetadata = {
        schemaVersion: 1,
        keyId: 'key_2',
        teamId: 'team_abc',
        name: 'legacy',
        state: 'active',
        createdAt: 5,
      };
      const apiKey = toApiKey(legacy, {
        apiKeyId: 'key_2',
        quotaEntityId: 'q2',
        limitAmount: 10,
        currentSpend: 1,
        currentByokSpend: 0,
        includeByokInQuota: false,
        refreshPeriod: 'none',
        active: true,
        archived: false,
        createdAt: 1,
        updatedAt: 2,
      });

      expect(apiKey).toMatchObject({
        partialKey: '',
        createdBy: '',
        activeAt: 5,
        createdByAppId: null,
      });
      expect(apiKey.quota).not.toHaveProperty('apiKeyId');
      expect(apiKey.quota?.limitAmount).toBe(10);
    });
  });
});
