import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import alerts from '../../../../src/commands/alerts';
import { parseMuteDuration } from '../../../../src/commands/alerts/group-actions';
import * as linkModule from '../../../../src/util/projects/link';
import * as getScopeModule from '../../../../src/util/get-scope';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedGetScope = vi.mocked(getScopeModule.default);

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
    actions: [],
    detections: [],
    ...overrides,
  };
}

describe('alerts acknowledged and muted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
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
    client.scenario.get('/alerts/v3/groups', (req, res) => {
      expect(req.query.limit).toBeUndefined();
      res.json([
        { id: 'grp_plain', status: 'active', title: 'Plain', actions: [] },
        {
          id: 'grp_acked',
          status: 'active',
          title: 'Acked',
          actions: [ackAction],
        },
        {
          id: 'grp_legacy_ack',
          status: 'resolved',
          title: 'Legacy acked',
          ack: { owner: { type: 'user', id: 'user_1' }, timestamp: 1 },
        },
        {
          id: 'grp_muted',
          status: 'active',
          title: 'Muted',
          actions: [mutedAction],
        },
      ]);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists only acknowledged groups from the v3 groups endpoint', async () => {
    client.setArgv('alerts', 'acknowledged', '--json');

    expect(await alerts(client)).toBe(0);
    const { groups } = JSON.parse(client.stdout.getFullOutput());
    expect(groups.map((g: { id: string }) => g.id)).toEqual([
      'grp_acked',
      'grp_legacy_ack',
    ]);
  });

  it('applies --limit after filtering', async () => {
    client.setArgv('alerts', 'acknowledged', '--limit', '1', '--json');

    expect(await alerts(client)).toBe(0);
    const { groups } = JSON.parse(client.stdout.getFullOutput());
    expect(groups.map((g: { id: string }) => g.id)).toEqual(['grp_acked']);
  });

  it('lists only muted groups with expiry and coverage columns', async () => {
    client.setArgv('alerts', 'muted');

    expect(await alerts(client)).toBe(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('grp_muted');
    expect(out).toContain('Muted Until');
    expect(out).toContain('Coverage');
    expect(out).not.toContain('grp_acked');
    expect(out).not.toContain('grp_plain');
  });
});

describe('alerts acknowledge, unacknowledge, mute, unmute', () => {
  let patches: Array<{ body: any; headers: Record<string, unknown> }>;
  let current: ReturnType<typeof v4Group>;

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    patches = [];
    current = v4Group();
    mockedGetLinkedProject.mockResolvedValue({ status: 'not_linked' } as any);
    mockedGetScope.mockResolvedValue({
      contextName: 'my-team',
      team: { id: 'team_dummy', slug: 'my-team' } as any,
      user: { id: 'user_dummy' } as any,
      app: null,
    });
    client.scenario.get('/alerts/v4/groups/:groupId', (req, res) => {
      expect(req.query).toEqual({ teamId: 'team_dummy' });
      res.json(current);
    });
    client.scenario.patch('/alerts/v4/groups/:groupId', (req, res) => {
      expect(req.params.groupId).toBe('grp_1');
      expect(req.query).toEqual({ teamId: 'team_dummy' });
      patches.push({ body: req.body, headers: req.headers });
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
          mutes: [{ ruleId: 'ar_new' }],
        });
      } else {
        res.json({
          type,
          group: v4Group(),
          removedRuleIds: req.body.ruleIds,
        });
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    expect(JSON.parse(client.stdout.getFullOutput()).outcome).toBe('unchanged');
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

  it('mutes for 24 hours by default with If-Match and an idempotency key', async () => {
    const before = Date.now();
    client.setArgv('alerts', 'mute', 'grp_1', '--json');

    expect(await alerts(client)).toBe(0);
    expect(patches).toHaveLength(1);
    const [{ body, headers }] = patches;
    expect(body.type).toBe('mute');
    expect(body.detectionId).toBeUndefined();
    expect(body.expiresAt).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);
    expect(body.expiresAt).toBeLessThanOrEqual(
      Date.now() + 24 * 60 * 60 * 1000
    );
    expect(headers['if-match']).toBe('rev_1');
    expect(headers['idempotency-key']).toEqual(expect.any(String));
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.outcome).toBe('muted');
    expect(payload.mutes).toEqual([{ ruleId: 'ar_new' }]);
  });

  it('mutes forever and for one detection', async () => {
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
    expect(patches[0].body).toEqual({
      type: 'mute',
      expiresAt: null,
      detectionId: 'al_1',
    });
  });

  it('rejects an invalid duration before calling the API', async () => {
    client.setArgv('alerts', 'mute', 'grp_1', '--duration', '30s', '--json');

    expect(await alerts(client)).toBe(2);
    expect(patches).toHaveLength(0);
  });

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
    expect(JSON.parse(client.stdout.getFullOutput()).outcome).toBe('unchanged');
  });

  it('requires a group', async () => {
    client.setArgv('alerts', 'mute', '--json');

    expect(await alerts(client)).toBe(2);
    expect(patches).toHaveLength(0);
  });
});

describe('parseMuteDuration', () => {
  it.each([
    ['1h', 60 * 60 * 1000],
    ['7d', 7 * 24 * 60 * 60 * 1000],
    ['forever', null],
    ['FOREVER', null],
  ])('parses %s', (input, expected) => {
    expect(parseMuteDuration(input)).toEqual({ valid: true, ms: expected });
  });

  it.each(['30s', '366d', 'soon', '60000'])('rejects %s', input => {
    expect(parseMuteDuration(input).valid).toBe(false);
  });
});
