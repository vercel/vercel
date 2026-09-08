import { client } from './client';
import type {
  FirewallConfigResponse,
  FirewallConfigListResponse,
  FirewallConfigChange,
  FirewallRule,
  FirewallIpRule,
  BypassRule,
  BypassListResponse,
} from '../../src/util/firewall/types';
import type { AttackStatusAnomaly } from '../../src/util/firewall/get-firewall-alerts';

export function createRule(index: number): FirewallRule {
  return {
    id: `rule_${String(index).padStart(3, '0')}`,
    name: `Test Rule ${index}`,
    description: `Description for rule ${index}`,
    active: index % 3 !== 0, // every 3rd rule is inactive
    conditionGroup: [
      {
        conditions: [
          {
            type: 'path',
            op: 'pre',
            value: `/api/v${index}`,
          },
        ],
      },
    ],
    action: {
      mitigate: {
        action: index % 2 === 0 ? 'deny' : 'challenge',
        actionDuration: '1h',
      },
    },
  };
}

export function createEmptyConditionRule(): FirewallRule {
  return {
    id: 'rule_empty_cond',
    name: 'Empty Conditions Rule',
    description: 'Rule with no conditions',
    active: true,
    conditionGroup: [],
    action: {
      mitigate: {
        action: 'log',
        actionDuration: null,
      },
    },
  };
}

export function createRateLimitRule(): FirewallRule {
  return {
    id: 'rule_rate_limit',
    name: 'Rate Limit API',
    description: 'Rate limit API endpoints',
    active: true,
    conditionGroup: [
      {
        conditions: [
          { type: 'path', op: 'pre', value: '/api' },
          { type: 'method', op: 'inc', value: ['POST', 'PUT', 'DELETE'] },
        ],
      },
    ],
    action: {
      mitigate: {
        action: 'rate_limit',
        rateLimit: {
          algo: 'fixed_window',
          window: 60,
          limit: 100,
          keys: ['ip'],
          action: 'deny',
        },
        actionDuration: null,
      },
    },
  };
}

export function createMultiGroupRule(): FirewallRule {
  return {
    id: 'rule_multi_group',
    name: 'Block Suspicious Traffic',
    description: 'Block bots and suspicious IPs',
    active: true,
    conditionGroup: [
      {
        conditions: [
          { type: 'user_agent', op: 'sub', value: 'crawler' },
          { type: 'geo_country', op: 'inc', neg: true, value: ['US', 'CA'] },
        ],
      },
      {
        conditions: [{ type: 'ip_address', op: 'eq', value: '1.2.3.4' }],
      },
      {
        conditions: [{ type: 'header', op: 'ex', key: 'X-Suspicious' }],
      },
    ],
    action: {
      mitigate: {
        action: 'deny',
        actionDuration: '1h',
      },
    },
  };
}

export function createRedirectRule(): FirewallRule {
  return {
    id: 'rule_redirect',
    name: 'Redirect Old Path',
    description: 'Redirect /old to /new',
    active: true,
    conditionGroup: [
      {
        conditions: [{ type: 'path', op: 'pre', value: '/old' }],
      },
    ],
    action: {
      mitigate: {
        action: 'redirect',
        redirect: {
          location: '/new',
          permanent: true,
        },
        actionDuration: null,
      },
    },
  };
}

export function createIpRule(index: number): FirewallIpRule {
  return {
    id: `ip_${String(index).padStart(3, '0')}`,
    ip: `10.0.0.${index}`,
    hostname: '*',
    action: 'deny',
    notes: `Blocked IP ${index}`,
  };
}

export function createBypassRule(index: number): BypassRule {
  return {
    OwnerId: 'team_dummy',
    Id: `bypass_${String(index).padStart(3, '0')}`,
    Ip: `192.168.1.${index}`,
    Domain: index % 2 === 0 ? 'example.com' : '*',
    ProjectId: 'firewall-test-project',
    Note: `Bypass note ${index}`,
    IsProjectRule: index % 2 !== 0,
  };
}

export function createConfig(
  overrides: Partial<FirewallConfigResponse> = {}
): FirewallConfigResponse {
  return {
    ownerId: 'team_dummy',
    projectKey: 'firewall-test-project',
    id: 'config_active',
    version: 1,
    updatedAt: new Date().toISOString(),
    firewallEnabled: true,
    rules: [],
    ips: [],
    changes: [],
    ...overrides,
  };
}

export function createChange(
  action: FirewallConfigChange['action'],
  overrides: Partial<FirewallConfigChange> = {}
): FirewallConfigChange {
  return {
    action,
    ...overrides,
  };
}

export function useListFirewallConfigs(
  active: FirewallConfigResponse | null = null,
  draft: FirewallConfigResponse | null = null
) {
  client.scenario.get('/v1/security/firewall/config', (_req: any, res: any) => {
    const response: FirewallConfigListResponse = {
      active,
      draft,
      versions: [],
    };
    res.json(response);
  });
}

export function useGetBypass(bypass: BypassRule[] = []) {
  client.scenario.get('/v1/security/firewall/bypass', (_req: any, res: any) => {
    const response: BypassListResponse = {
      result: bypass,
    };
    res.json(response);
  });
}

/**
 * Mock the bypass endpoint rejecting. Defaults to the 402 the API returns when
 * the account's plan has no IP Bypass access.
 */
export function useGetBypassError(
  statusCode = 402,
  message = 'IP Bypass is unavailable for team acme. Pro and Enterprise plans include it.'
) {
  client.scenario.get('/v1/security/firewall/bypass', (_req: any, res: any) => {
    res
      .status(statusCode)
      .json({ error: { code: 'payment_required', message } });
  });
}

/**
 * Mutable so a test can change the activity window after `beforeEach` set it
 * up. The handlers read this on each request rather than closing over the
 * arguments, because `client.scenario` is an express Router: re-registering a
 * route adds a second handler and the first one still answers.
 */
export const firewallActivity = {
  queryStatus: 200,
  /** Status for `/alerts/v3/groups`, to fail one alert source alone. */
  alertsStatus: 200,
  /** Status for `/v1/security/firewall/attack-status`. */
  attackStatusStatus: 200,
  series: [] as unknown[],
  alerts: [] as unknown[],
  anomalies: [] as AttackStatusAnomaly[],
  /** Summary rows for the by-rule query, keyed by `waf_rule_id`. */
  topRules: [] as unknown[],
  /** Summary rows for the by-action query, exercising the totals branch. */
  actionSummary: undefined as unknown[] | undefined,
  /** Query string the alerts request carried. */
  alertsQuery: undefined as Record<string, unknown> | undefined,
  /** Query string the attack-status request carried. */
  attackStatusQuery: undefined as Record<string, unknown> | undefined,
  /** Held back this long before answering, for exercising timeouts. */
  attackStatusDelayMs: 0,
  /**
   * Body sent with a failing attack-status response. `null` sends none,
   * which is what makes `responseError` fall back to its sentinel.
   */
  attackStatusBody: undefined as unknown,
  /** GET /alerts/v3/groups/:id bodies, keyed by id. */
  alertGroups: {} as Record<string, unknown>,
  /** Ids requested via GET /alerts/v3/groups/:id, in arrival order. */
  groupRequests: [] as string[],
  /** Actions from GET /v1/security/firewall/events. */
  events: [] as unknown[],
  eventsStatus: 200,
  eventsQuery: undefined as Record<string, unknown> | undefined,
  /** Summary rows for inspect path queries, keyed by `request_path`. */
  topPaths: [] as unknown[],
  /** Every observability query body, in arrival order. */
  queries: [] as {
    groupBy?: string[];
    startTime?: string;
    endTime?: string;
    granularity?: { minutes?: number; hours?: number };
    filter?: string;
  }[],
};

/**
 * Mock the endpoints behind `firewall overview`'s activity window. Returns an
 * empty window by default, which is enough for tests that only care about the
 * configuration block. Set `firewallActivity.queryStatus` to fail the query.
 */
export function useFirewallActivity({
  series = [] as unknown[],
  alerts = [] as unknown[],
  anomalies = [] as AttackStatusAnomaly[],
  topRules = [] as unknown[],
  actionSummary,
  alertGroups = {},
  events = [] as unknown[],
  topPaths = [] as unknown[],
}: {
  series?: unknown[];
  alerts?: unknown[];
  anomalies?: AttackStatusAnomaly[];
  topRules?: unknown[];
  actionSummary?: unknown[];
  alertGroups?: Record<string, unknown>;
  events?: unknown[];
  topPaths?: unknown[];
} = {}) {
  firewallActivity.queryStatus = 200;
  firewallActivity.alertsStatus = 200;
  firewallActivity.attackStatusStatus = 200;
  firewallActivity.series = series;
  firewallActivity.alerts = alerts;
  firewallActivity.anomalies = anomalies;
  firewallActivity.topRules = topRules;
  firewallActivity.actionSummary = actionSummary;
  firewallActivity.alertGroups = alertGroups;
  firewallActivity.groupRequests = [];
  firewallActivity.events = events;
  firewallActivity.eventsStatus = 200;
  firewallActivity.eventsQuery = undefined;
  firewallActivity.topPaths = topPaths;
  firewallActivity.queries = [];
  firewallActivity.alertsQuery = undefined;
  firewallActivity.attackStatusQuery = undefined;
  firewallActivity.attackStatusDelayMs = 0;
  firewallActivity.attackStatusBody = undefined;

  client.scenario.post('/v2/observability/query', (req: any, res: any) => {
    firewallActivity.queries.push(req.body ?? {});
    if (firewallActivity.queryStatus !== 200) {
      res
        .status(firewallActivity.queryStatus)
        .json({ error: { message: 'Observability Plus is required' } });
      return;
    }
    // Both activity panels post to this endpoint; only the group-by tells
    // them apart. The by-rule query reads `summary` alone, the by-action one
    // reads `data` and falls back to summing it when `summary` is absent.
    const groupBy = (req.body?.groupBy ?? []) as string[];
    if (groupBy.includes('waf_rule_id')) {
      res.json({ summary: firewallActivity.topRules, meta: {} });
      return;
    }
    if (groupBy.includes('request_path')) {
      res.json({ summary: firewallActivity.topPaths, meta: {} });
      return;
    }
    res.json({
      data: firewallActivity.series,
      ...(firewallActivity.actionSummary
        ? { summary: firewallActivity.actionSummary }
        : {}),
      meta: {},
    });
  });
  client.scenario.get('/alerts/v3/groups', (req: any, res: any) => {
    firewallActivity.alertsQuery = req.query;
    if (firewallActivity.alertsStatus !== 200) {
      res.status(firewallActivity.alertsStatus).json({
        error: {
          message:
            firewallActivity.alertsStatus === 402
              ? 'Observability Plus is required'
              : 'Alerts unavailable',
        },
      });
      return;
    }
    res.json(firewallActivity.alerts);
  });
  client.scenario.get('/alerts/v3/groups/:id', (req: any, res: any) => {
    firewallActivity.groupRequests.push(req.params.id);
    const group = firewallActivity.alertGroups[req.params.id];
    if (!group) {
      res.status(404).json({ error: { message: 'Not found' } });
      return;
    }
    res.json(group);
  });
  client.scenario.get(
    '/v1/security/firewall/attack-status',
    (req: any, res: any) => {
      firewallActivity.attackStatusQuery = req.query;
      const answer = () => {
        if (firewallActivity.attackStatusStatus !== 200) {
          const body =
            firewallActivity.attackStatusBody === undefined
              ? { error: { message: 'Attack status unavailable' } }
              : firewallActivity.attackStatusBody;
          if (body === null) {
            res.status(firewallActivity.attackStatusStatus).end();
            return;
          }
          res.status(firewallActivity.attackStatusStatus).json(body);
          return;
        }
        res.json({ anomalies: firewallActivity.anomalies });
      };
      if (firewallActivity.attackStatusDelayMs > 0) {
        setTimeout(answer, firewallActivity.attackStatusDelayMs);
        return;
      }
      answer();
    }
  );
  client.scenario.get('/v1/security/firewall/events', (req: any, res: any) => {
    firewallActivity.eventsQuery = req.query;
    if (firewallActivity.eventsStatus !== 200) {
      res.status(firewallActivity.eventsStatus).json({
        error: {
          message:
            firewallActivity.eventsStatus === 402
              ? 'Observability Plus is required'
              : 'Firewall events unavailable',
        },
      });
      return;
    }
    res.json({ actions: firewallActivity.events });
  });
}

/**
 * A DDoS anomaly as `/v1/security/firewall/attack-status` reports one: request
 * totals live under a per-host map keyed by `<rule>:<action>`, which is what
 * the CLI reduces into a single mitigated-request count.
 */
export function createO11yFirewallAlert({
  id = 'al_test',
  title = 'DDoS Mitigation',
  type = 'firewallSystemRule_anomaly',
  startedAt = Date.now() - 3_600_000,
  resolvedAt,
  action = 'deny',
  ruleId = 'sys_dos_mitigation',
  count = 134_500,
}: {
  id?: string;
  title?: string;
  type?: string;
  startedAt?: number;
  resolvedAt?: number;
  action?: string;
  ruleId?: string;
  count?: number;
}) {
  return {
    id,
    title,
    type,
    startedAt,
    resolvedAt,
    data: { action, ruleId, count },
  };
}

export function createAttackAnomaly({
  startTime,
  endTime = null,
  host = 'example.com',
  challenged = 0,
  denied = 0,
}: {
  startTime: number;
  endTime?: number | null;
  host?: string;
  challenged?: number;
  denied?: number;
}): AttackStatusAnomaly {
  return {
    ownerId: 'team_dummy',
    projectId: 'firewall-test-project',
    startTime,
    endTime,
    atMinute: Math.floor(startTime / 60_000),
    affectedHostMap: {
      [host]: {
        ddosAlerts: {
          'sys_dos_mitigation:challenge': {
            atMinute: String(Math.floor(startTime / 60_000)),
            totalReqs: challenged,
          },
          'sys_dos_mitigation:deny': {
            atMinute: String(Math.floor(startTime / 60_000)),
            totalReqs: denied,
          },
        },
      },
    },
  };
}

export const capturedRequests: {
  activate?: { version: string };
  deleteDraft?: boolean;
  patchDraft?: { action: string; id?: string; value?: unknown };
  teamConfigQuery?: Record<string, string>;
  teamActivate?: { version: string; query: Record<string, string> };
  teamDeleteDraft?: { query: Record<string, string> };
  teamPatchDraft?: {
    action: string;
    id?: string;
    value?: unknown;
    query: Record<string, string>;
  };
  addBypass?: {
    sourceIp?: string;
    allSources?: boolean;
    domain?: string;
    projectScope?: boolean;
    note?: string;
  };
  removeBypass?: { sourceIp?: string };
  updateAttackMode?: {
    attackModeEnabled: boolean;
    attackModeActiveUntil?: string;
  };
} = {};

export function useActivateConfig() {
  delete capturedRequests.activate;
  client.scenario.post(
    '/v1/security/firewall/config/:version/activate',
    (req: any, res: any) => {
      capturedRequests.activate = { version: req.params.version };
      res.json(
        createConfig({
          id: 'config_new_active',
          version: 2,
        })
      );
    }
  );
}

export function useDeleteDraft() {
  delete capturedRequests.deleteDraft;
  client.scenario.delete(
    '/v1/security/firewall/config/draft',
    (_req: any, res: any) => {
      capturedRequests.deleteDraft = true;
      res.status(204).end();
    }
  );
}

export function useAddBypass() {
  delete capturedRequests.addBypass;
  client.scenario.post('/v1/security/firewall/bypass', (req: any, res: any) => {
    const { sourceIp, allSources, domain, projectScope, note } = req.body;
    capturedRequests.addBypass = {
      sourceIp,
      allSources,
      domain,
      projectScope,
      note,
    };
    const ip = allSources ? '0.0.0.0/0' : sourceIp || '0.0.0.0';
    const bypassDomain = domain || (projectScope ? '*' : '*');
    res.json({
      ok: true,
      result: [
        {
          OwnerId: 'team_dummy',
          Id: `firewall-test-project#${ip}`,
          Domain: bypassDomain,
          Ip: ip,
          ProjectId: 'firewall-test-project',
          Note: note || '',
          IsProjectRule: !!projectScope,
        },
      ],
      pagination: null,
    });
  });
}

export function useRemoveBypass() {
  delete capturedRequests.removeBypass;
  client.scenario.delete(
    '/v1/security/firewall/bypass',
    (req: any, res: any) => {
      capturedRequests.removeBypass = {
        sourceIp: req.query.sourceIp || req.body?.sourceIp,
      };
      res.json({ ok: true });
    }
  );
}

export function useUpdateAttackMode() {
  delete capturedRequests.updateAttackMode;
  client.scenario.post('/security/attack-mode', (req: any, res: any) => {
    capturedRequests.updateAttackMode = req.body;
    res.json({
      attackModeEnabled: req.body.attackModeEnabled,
      attackModeUpdatedAt: Date.now(),
    });
  });
}

export let lastPatchBody: any = null;

export function usePatchDraft(
  responseOverrides: Partial<FirewallConfigResponse> = {}
) {
  delete capturedRequests.patchDraft;
  lastPatchBody = null;
  client.scenario.patch(
    '/v1/security/firewall/config/draft',
    (req: any, res: any) => {
      const patch = req.body;
      capturedRequests.patchDraft = {
        action: patch.action,
        id: patch.id,
        value: patch.value,
      };
      lastPatchBody = patch;
      res.json(
        createConfig({
          id: 'config_draft',
          changes: [
            {
              action: patch.action,
              id: patch.id || `generated_${Date.now()}`,
              value: patch.value,
            },
          ],
          ...responseOverrides,
        })
      );
    }
  );
}

export function useListTeamFirewallConfigs(
  active: FirewallConfigResponse | null = null,
  draft: FirewallConfigResponse | null = null
) {
  delete capturedRequests.teamConfigQuery;
  client.scenario.get(
    '/v1/security/firewall/team-config',
    (req: any, res: any) => {
      capturedRequests.teamConfigQuery = { ...req.query };
      const response: FirewallConfigListResponse = {
        active,
        draft,
        versions: [],
      };
      res.json(response);
    }
  );
}

export function usePatchTeamDraft(
  responseOverrides: Partial<FirewallConfigResponse> = {}
) {
  delete capturedRequests.teamPatchDraft;
  client.scenario.patch(
    '/v1/security/firewall/team-config/draft',
    (req: any, res: any) => {
      const patch = req.body;
      capturedRequests.teamPatchDraft = {
        action: patch.action,
        id: patch.id,
        value: patch.value,
        query: { ...req.query },
      };
      res.json(
        createConfig({
          id: 'team_config_draft',
          projectKey: 'v1_sc#draft',
          changes: [
            {
              action: patch.action,
              id: patch.id || `generated_${Date.now()}`,
              value: patch.value,
            },
          ],
          ...responseOverrides,
        })
      );
    }
  );
}

export function useActivateTeamConfig() {
  delete capturedRequests.teamActivate;
  client.scenario.post(
    '/v1/security/firewall/team-config/:version/activate',
    (req: any, res: any) => {
      capturedRequests.teamActivate = {
        version: req.params.version,
        query: { ...req.query },
      };
      res.json(
        createConfig({
          id: 'team_config_new_active',
          projectKey: 'v1_sc#active',
          version: 2,
        })
      );
    }
  );
}

export function useDeleteTeamDraft() {
  delete capturedRequests.teamDeleteDraft;
  client.scenario.delete(
    '/v1/security/firewall/team-config/draft',
    (req: any, res: any) => {
      capturedRequests.teamDeleteDraft = { query: { ...req.query } };
      res.status(204).end();
    }
  );
}

export function useTeamConfigError(
  statusCode: number,
  code: string,
  message: string
) {
  client.scenario.get(
    '/v1/security/firewall/team-config',
    (_req: any, res: any) => {
      res.status(statusCode).json({ error: { code, message } });
    }
  );
}

export function useGenerateFirewallRule(rule?: FirewallRule, error?: string) {
  client.scenario.post(
    '/v1/security/firewall/config/generate-rule',
    (_req: any, res: any) => {
      if (error) {
        res.json({ error });
        return;
      }
      res.json({
        rule: rule || {
          name: 'AI Generated Rule',
          description: 'Generated by AI',
          active: true,
          conditionGroup: [
            {
              conditions: [
                { type: 'geo_country', op: 'inc', value: ['CN', 'RU'] },
              ],
            },
          ],
          action: {
            mitigate: {
              action: 'deny',
              rateLimit: null,
              redirect: null,
              actionDuration: null,
            },
          },
        },
      });
    }
  );
}

export function useGenerateFirewallRuleError(statusCode = 500) {
  client.scenario.post(
    '/v1/security/firewall/config/generate-rule',
    (_req: any, res: any) => {
      res.status(statusCode).json({ error: 'Generation failed' });
    }
  );
}

/**
 * A persistent WAF action as `/v1/security/firewall/events` reports one.
 */
/** The API's timestamp format: space-separated UTC with no zone. */
function apiTimestamp(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * A row as `/v1/security/firewall/events` returns one. `action` is the
 * mitigation (`challenge`, `deny`); `action_type` is the kind of rule that
 * applied it, `system-action` for the platform's own. Keeping those distinct
 * matters — conflating them is what made the Action column and the denied-IP
 * list read the wrong field.
 */
export function createPersistentAction({
  startTime = Date.now() - 600_000,
  endTime = Date.now(),
  action = 'challenge',
  custom = false,
  host = 'vercel.com',
  ip = '51.158.168.18',
  count = 4,
  isActive = false,
}: {
  startTime?: number;
  endTime?: number;
  action?: string;
  /** A project custom rule rather than a platform rule. */
  custom?: boolean;
  host?: string;
  ip?: string;
  count?: number;
  isActive?: boolean;
} = {}) {
  return {
    startTime: apiTimestamp(startTime),
    endTime: apiTimestamp(endTime),
    isActive,
    action_type: custom ? 'custom-action' : 'system-action',
    action,
    ruleId: custom ? 'rule_abc123' : null,
    ruleName: custom ? 'Block scrapers' : null,
    host,
    public_ip: ip,
    count,
  };
}

/**
 * The column each observability row carries its value in. The API flattens
 * `<metric>_<aggregation>`, replacing dots — see `getRollupColumnName`.
 */
export const FIREWALL_ROLLUP_COLUMN = 'vercel_firewall_action_count_sum';
