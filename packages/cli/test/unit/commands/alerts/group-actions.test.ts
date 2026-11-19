import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import alerts from '../../../../src/commands/alerts';
import {
  getMuteExpiresAt,
  parseMuteDuration,
} from '../../../../src/commands/alerts/group-actions';
import * as linkModule from '../../../../src/util/projects/link';
import * as getScopeModule from '../../../../src/util/get-scope';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedGetScope = vi.mocked(getScopeModule.default);

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const ackAction = {
  type: 'acknowledge',
  owner: { type: 'user', id: 'user_1' },
  timestamp: 1792500000000,
};

const mutedAction = {
  type: 'muted',
  owner: { type: 'user', id: 'user_1' },
  timestamp: 1792500000000,
  expiresAt: 1792503600000,
  detectionKeys: ['/api/checkout_5xx_'],
  ruleIds: ['ar_1', 'ar_2'],
  coverage: 'all',
};

function v4Group(overrides: Record<string, unknown> = {}) {
  return {
    id: 'grp_1',
    teamId: 'team_dummy',
    revision: 'rev_1',
    projectId: 'prj_alerts',
    title: 'Checkout errors',
    type: 'error_anomaly',
    status: 'active',
    recordedStartedAt: 1792400000000,
    latestEventAt: 1792500000000,
    actions: [],
    detections: [],
    ...overrides,
  };
}

function mockLinkedProject() {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: 'prj_alerts',
      name: 'alerts-project',
      accountId: 'team_dummy',
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    org: { id: 'team_dummy', slug: 'my-team', type: 'team' },
  });
}

function mockTeamScope() {
  mockedGetScope.mockResolvedValue({
    contextName: 'my-team',
    team: { id: 'team_dummy', slug: 'my-team' } as any,
    user: { id: 'user_dummy' } as any,
    app: null,
  });
}

function apiError(res: any, status: number, message = 'nope') {
  res.statusCode = status;
  res.json({ error: { code: `http_${status}`, message } });
}

describe('alerts acknowledged and muted', () => {
  let requestQuery: Record<string, unknown> | undefined;
  let response: Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    requestQuery = undefined;
    response = {
      alerts: [
        v4Group({ id: 'grp_acked', title: 'Acked', actions: [ackAction] }),
      ],
      pagination: { count: 1, next: null },
      counts: { important: 0, other: 0, acknowledged: 1, muted: 0 },
      truncated: false,
    };
    client.scenario.get('/alerts/v4/groups', (req, res) => {
      requestQuery = req.query as Record<string, unknown>;
      res.json(response);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists the v4 acknowledged view for the linked project', async () => {
    client.setArgv('alerts', 'acknowledged', '--json');

    expect(await alerts(client)).toBe(0);
    expect(requestQuery).toEqual({
      teamId: 'team_dummy',
      projectId: 'prj_alerts',
      views: 'acknowledged',
      sort: 'date',
      limit: '20',
    });
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      groups: response.alerts,
      pagination: { next: null },
    });
  });

  it('passes filters and the cursor, and prints the next page command', async () => {
    response.pagination = { count: 1, next: 'cursor_2' };
    client.setArgv(
      'alerts',
      'muted',
      '--all',
      '--type',
      'error_anomaly',
      '--since',
      '2026-11-01T00:00:00.000Z',
      '--limit',
      '5',
      '--next',
      'cursor_1'
    );

    expect(await alerts(client)).toBe(0);
    expect(requestQuery).toMatchObject({
      views: 'muted',
      types: 'error_anomaly',
      from: '2026-11-01T00:00:00.000Z',
      limit: '5',
      cursor: 'cursor_1',
    });
    expect(requestQuery?.projectId).toBeUndefined();
    const out = client.stderr.getFullOutput();
    expect(out).toContain('Muted Until');
    expect(out).toContain('Coverage');
    expect(out).toContain('--next=cursor_2');
  });

  it('warns when the API snapshot was truncated', async () => {
    response.truncated = true;
    client.setArgv('alerts', 'acknowledged', '--json');

    expect(await alerts(client)).toBe(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.warnings[0].reason).toBe('truncated');
  });

  it('rejects a malformed cursor before calling the API', async () => {
    client.setArgv('alerts', 'muted', '--next', 'not a cursor', '--json');

    expect(await alerts(client)).toBe(2);
    expect(requestQuery).toBeUndefined();
  });
});

describe('alerts acknowledge, unacknowledge, mute, unmute', () => {
  let patches: Array<{ body: any; headers: Record<string, unknown> }>;
  let current: ReturnType<typeof v4Group>;
  let readStatus: number | undefined;
  let patchHandler: ((req: any, res: any) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    patches = [];
    current = v4Group();
    readStatus = undefined;
    patchHandler = undefined;
    mockedGetLinkedProject.mockResolvedValue({ status: 'not_linked' } as any);
    mockTeamScope();
    client.scenario.get('/alerts/v4/groups/:groupId', (req, res) => {
      expect(req.query).toEqual({ teamId: 'team_dummy' });
      if (readStatus) {
        return apiError(res, readStatus);
      }
      res.json(current);
    });
    client.scenario.patch('/alerts/v4/groups/:groupId', (req, res) => {
      expect(req.params.groupId).toBe('grp_1');
      expect(req.query).toEqual({ teamId: 'team_dummy' });
      patches.push({ body: req.body, headers: req.headers });
      if (patchHandler) {
        return patchHandler(req, res);
      }
      const { type } = req.body;
      if (type === 'ack') {
        res.json({
          type,
          group: v4Group({ actions: req.body.ack ? [ackAction] : [] }),
        });
      } else if (type === 'mute') {
        res.json({
          type,
          group: v4Group({
            actions: [{ ...mutedAction, expiresAt: req.body.expiresAt }],
          }),
          mutes: [{ ruleId: 'ar_new', expiresAt: req.body.expiresAt }],
        });
      } else if (type === 'updateMute') {
        res.json({
          type,
          group: v4Group({
            revision: 'rev_2',
            actions: [{ ...mutedAction, expiresAt: req.body.expiresAt }],
          }),
          mutes: req.body.ruleIds.map((ruleId: string) => ({
            ruleId,
            expiresAt: req.body.expiresAt,
          })),
        });
      } else {
        res.json({ type, group: v4Group(), removedRuleIds: req.body.ruleIds });
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('acknowledge', () => {
    it('acknowledges a group through the v4 PATCH endpoint', async () => {
      client.setArgv('alerts', 'acknowledge', 'grp_1', '--json');

      expect(await alerts(client)).toBe(0);
      expect(patches.map(p => p.body)).toEqual([{ type: 'ack', ack: true }]);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.outcome).toBe('acknowledged');
      expect(payload.group.actions[0].type).toBe('acknowledge');
    });

    it('prints a receipt', async () => {
      client.setArgv('alerts', 'acknowledge', 'grp_1');

      expect(await alerts(client)).toBe(0);
      expect(patches).toHaveLength(1);
      expect(client.stderr.getFullOutput()).toContain('Acknowledged');
    });

    it('reports an already acknowledged group as unchanged', async () => {
      current = v4Group({ actions: [ackAction] });
      client.setArgv('alerts', 'acknowledge', 'grp_1', '--json');

      expect(await alerts(client)).toBe(0);
      expect(patches).toHaveLength(0);
      expect(JSON.parse(client.stdout.getFullOutput()).outcome).toBe(
        'unchanged'
      );
    });

    it('unacknowledges a group', async () => {
      current = v4Group({ actions: [ackAction] });
      client.setArgv('alerts', 'unacknowledge', 'grp_1', '--json');

      expect(await alerts(client)).toBe(0);
      expect(patches.map(p => p.body)).toEqual([{ type: 'ack', ack: false }]);
      expect(JSON.parse(client.stdout.getFullOutput()).outcome).toBe(
        'unacknowledged'
      );
    });

    it('explains a permission error', async () => {
      patchHandler = (_req, res) => apiError(res, 403);
      client.setArgv('alerts', 'acknowledge', 'grp_1');

      expect(await alerts(client)).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'permission to update alerts'
      );
    });

    it('reports a missing group', async () => {
      readStatus = 404;
      client.setArgv('alerts', 'acknowledge', 'grp_1');

      expect(await alerts(client)).toBe(1);
      expect(patches).toHaveLength(0);
      expect(client.stderr.getFullOutput()).toContain(
        'Alert group grp_1 was not found in this team.'
      );
    });

    it('emits an agent error payload in non-interactive mode', async () => {
      patchHandler = (_req, res) => apiError(res, 403);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as never);
      client.nonInteractive = true;
      client.setArgv('alerts', 'acknowledge', 'grp_1');

      await expect(alerts(client)).rejects.toThrow('process.exit called');
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        status: 'error',
        reason: 'forbidden',
      });
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('mute', () => {
    it('mutes for 24 hours by default with If-Match and an idempotency key', async () => {
      const before = Date.now();
      client.setArgv('alerts', 'mute', 'grp_1', '--json');

      expect(await alerts(client)).toBe(0);
      expect(patches).toHaveLength(1);
      const [{ body, headers }] = patches;
      expect(body.type).toBe('mute');
      expect(body.detectionId).toBeUndefined();
      expect(body.expiresAt % 1000).toBe(0);
      expect(body.expiresAt).toBeGreaterThanOrEqual(before + DAY);
      expect(body.expiresAt).toBeLessThanOrEqual(Date.now() + DAY + 1000);
      expect(headers['if-match']).toBe('rev_1');
      expect(headers['idempotency-key']).toEqual(expect.any(String));
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.outcome).toBe('muted');
      expect(payload.mutes).toEqual([
        { ruleId: 'ar_new', expiresAt: body.expiresAt },
      ]);
    });

    it('keeps a 1m mute inside the API minimum', async () => {
      const before = Date.now();
      client.setArgv('alerts', 'mute', 'grp_1', '--duration', '1m', '--json');

      expect(await alerts(client)).toBe(0);
      expect(patches[0].body.expiresAt).toBeGreaterThanOrEqual(
        before + MINUTE + 10 * 1000
      );
    });

    it('mutes forever and for one detection without touching existing mutes', async () => {
      current = v4Group({ actions: [mutedAction] });
      client.setArgv(
        'alerts',
        'mute',
        'grp_1',
        '--duration',
        'forever',
        '--detection',
        'al_1',
        '--json'
      );

      expect(await alerts(client)).toBe(0);
      expect(patches.map(p => p.body)).toEqual([
        { type: 'mute', expiresAt: null, detectionId: 'al_1' },
      ]);
    });

    it('changes the expiry of a fully muted group instead of adding mutes', async () => {
      current = v4Group({ actions: [mutedAction] });
      client.setArgv('alerts', 'mute', 'grp_1', '--duration', '7d', '--json');

      expect(await alerts(client)).toBe(0);
      expect(patches.map(p => p.body.type)).toEqual(['updateMute']);
      expect(patches[0].body.ruleIds).toEqual(['ar_1', 'ar_2']);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.outcome).toBe('updated');
      expect(payload.mutes[0].expiresAt).toBe(patches[0].body.expiresAt);
    });

    it('shows the new expiry and the updated mutes in the receipt', async () => {
      current = v4Group({ actions: [mutedAction] });
      client.setArgv('alerts', 'mute', 'grp_1', '--duration', 'forever');

      expect(await alerts(client)).toBe(0);
      const out = client.stderr.getFullOutput();
      expect(out).toContain('Mute updated');
      expect(out).toContain('until unmuted');
      expect(out).toContain('2 existing mutes');
    });

    it('updates existing mutes and then mutes the rest of a partly muted group', async () => {
      current = v4Group({
        actions: [{ ...mutedAction, coverage: 'partial' }],
      });
      client.setArgv('alerts', 'mute', 'grp_1', '--json');

      expect(await alerts(client)).toBe(0);
      expect(patches.map(p => p.body.type)).toEqual(['updateMute', 'mute']);
      expect(patches[1].body.expiresAt).toBe(patches[0].body.expiresAt);
      expect(patches[1].headers['if-match']).toBe('rev_2');
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.outcome).toBe('muted');
      expect(payload.mutes.map((m: { ruleId: string }) => m.ruleId)).toEqual([
        'ar_1',
        'ar_2',
        'ar_new',
      ]);
    });

    it('reuses the idempotency key when a failed mute is retried', async () => {
      patchHandler = (_req, res) => {
        if (patches.length === 1) {
          return apiError(res, 500);
        }
        res.json({ type: 'mute', group: v4Group(), mutes: [] });
      };
      client.setArgv('alerts', 'mute', 'grp_1', '--json');

      expect(await alerts(client)).toBe(0);
      expect(patches).toHaveLength(2);
      expect(patches[1].headers['idempotency-key']).toBe(
        patches[0].headers['idempotency-key']
      );
    });

    it('asks to check the group before repeating a mute that is still in progress', async () => {
      patchHandler = (_req, res) => apiError(res, 409);
      client.setArgv('alerts', 'mute', 'grp_1');

      expect(await alerts(client)).toBe(1);
      const out = client.stderr.getFullOutput();
      expect(out).toContain('still in progress');
      expect(out).toContain('alerts inspect grp_1');
    });

    it('asks to run it again when the group changed', async () => {
      patchHandler = (_req, res) => apiError(res, 412);
      client.setArgv('alerts', 'mute', 'grp_1');

      expect(await alerts(client)).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'changed while it was being muted'
      );
    });

    it('rejects an invalid duration before calling the API', async () => {
      client.setArgv('alerts', 'mute', 'grp_1', '--duration', '30s', '--json');

      expect(await alerts(client)).toBe(2);
      expect(patches).toHaveLength(0);
    });

    it('requires a group', async () => {
      client.setArgv('alerts', 'mute', '--json');

      expect(await alerts(client)).toBe(2);
      expect(patches).toHaveLength(0);
    });
  });

  describe('unmute', () => {
    it('removes every mute created from the group', async () => {
      current = v4Group({ actions: [mutedAction] });
      client.setArgv('alerts', 'unmute', 'grp_1', '--json');

      expect(await alerts(client)).toBe(0);
      expect(patches.map(p => p.body)).toEqual([
        { type: 'unmute', ruleIds: ['ar_1', 'ar_2'] },
      ]);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.outcome).toBe('unmuted');
      expect(payload.removedRuleIds).toEqual(['ar_1', 'ar_2']);
    });

    it('reports a group without mutes as unchanged', async () => {
      client.setArgv('alerts', 'unmute', 'grp_1', '--json');

      expect(await alerts(client)).toBe(0);
      expect(patches).toHaveLength(0);
      expect(JSON.parse(client.stdout.getFullOutput()).outcome).toBe(
        'unchanged'
      );
    });

    it('sends more than 100 rules in batches', async () => {
      const ruleIds = Array.from({ length: 150 }, (_, i) => `ar_${i}`);
      current = v4Group({ actions: [{ ...mutedAction, ruleIds }] });
      client.setArgv('alerts', 'unmute', 'grp_1', '--json');

      expect(await alerts(client)).toBe(0);
      expect(patches.map(p => p.body.ruleIds.length)).toEqual([100, 50]);
      expect(
        JSON.parse(client.stdout.getFullOutput()).removedRuleIds
      ).toHaveLength(150);
    });

    it('does not retry a failed batch and reports what was removed', async () => {
      const ruleIds = Array.from({ length: 150 }, (_, i) => `ar_${i}`);
      current = v4Group({ actions: [{ ...mutedAction, ruleIds }] });
      patchHandler = (req, res) => {
        if (patches.length === 1) {
          return res.json({
            type: 'unmute',
            group: v4Group(),
            removedRuleIds: req.body.ruleIds,
          });
        }
        apiError(res, 500);
      };
      client.setArgv('alerts', 'unmute', 'grp_1');

      expect(await alerts(client)).toBe(1);
      expect(patches).toHaveLength(2);
      const out = client.stderr.getFullOutput();
      expect(out).toContain('may have been applied');
      expect(out).toContain('100 of 150 mutes were already removed');
    });

    it('explains a 404 from mutes that were already removed', async () => {
      current = v4Group({ actions: [mutedAction] });
      patchHandler = (_req, res) => apiError(res, 404);
      client.setArgv('alerts', 'unmute', 'grp_1');

      expect(await alerts(client)).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'were already removed or have expired'
      );
    });
  });
});

describe('parseMuteDuration', () => {
  it.each([
    ['1h', 60 * MINUTE],
    ['7d', 7 * DAY],
    ['forever', null],
    ['FOREVER', null],
  ])('parses %s', (input, expected) => {
    expect(parseMuteDuration(input)).toEqual({ valid: true, ms: expected });
  });

  it.each(['30s', '366d', 'soon', '60000'])('rejects %s', input => {
    expect(parseMuteDuration(input).valid).toBe(false);
  });
});

describe('getMuteExpiresAt', () => {
  const now = 1_800_000_000_123;

  it('keeps slack inside the API bounds and lands on a whole second', () => {
    expect(getMuteExpiresAt(MINUTE, now)).toBe(1_800_000_071_000);
    expect(getMuteExpiresAt(365 * DAY, now)! - now).toBeLessThan(365 * DAY);
    expect(getMuteExpiresAt(DAY, now)! % 1000).toBe(0);
  });

  it('returns null for forever', () => {
    expect(getMuteExpiresAt(null, now)).toBeNull();
  });
});
