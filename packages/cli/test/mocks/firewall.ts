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

export const capturedRequests: {
  activate?: { version: string };
  deleteDraft?: boolean;
  patchDraft?: { action: string; id?: string; value?: unknown };
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
