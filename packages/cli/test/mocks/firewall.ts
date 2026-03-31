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
  client.scenario.post('/v1/security/firewall/bypass', (req: any, res: any) => {
    const { sourceIp, allSources, domain, projectScope, note } = req.body;
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
  client.scenario.delete(
    '/v1/security/firewall/bypass',
    (_req: any, res: any) => {
      res.json({ ok: true });
    }
  );
}
