import { expect, vi } from 'vitest';
import { client } from '../../../mocks/client';
import * as linkModule from '../../../../src/util/projects/link';
import type {
  DrainSamplingRule,
  TracingConfig,
} from '../../../../src/commands/traces/config/rules';

export const configPath = '/v1/drains/tracing/config';

export function mockConfigScope({
  projectId = 'prj_test',
  projectName = 'traces-project',
  teamId = 'team_dummy',
  teamSlug = 'my-team',
} = {}) {
  vi.mocked(linkModule.getLinkedProject).mockResolvedValue({
    status: 'linked',
    project: {
      id: projectId,
      name: projectName,
      accountId: teamId,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    org: { id: teamId, slug: teamSlug, type: 'team' },
  });
}

export function headRule(
  rate: number,
  fields: Omit<Partial<DrainSamplingRule>, 'type' | 'rate'> = {}
): DrainSamplingRule {
  return { type: 'head_sampling', rate, ...fields };
}

export function useTracingConfig(
  initial: TracingConfig,
  failure?: { status: number; code: string; message: string }
) {
  let config = initial;
  const requests: Array<{
    method: string;
    query: Record<string, unknown>;
    body?: unknown;
  }> = [];
  const bodies: Array<{ enabled: boolean; sampling?: DrainSamplingRule[] }> =
    [];
  client.scenario.get(configPath, (req, res) => {
    requests.push({ method: 'GET', query: req.query });
    res.json(config);
  });
  client.scenario.put(configPath, (req, res) => {
    requests.push({ method: 'PUT', query: req.query, body: req.body });
    bodies.push(req.body);
    if (failure) {
      res.status(failure.status).json({
        error: { code: failure.code, message: failure.message },
      });
      return;
    }
    config = {
      enabled: req.body.enabled,
      sampling: req.body.enabled ? req.body.sampling : [],
    };
    res.json(config);
  });
  return { requests, bodies, getConfig: () => config };
}

export function expectConfigTarget(
  requests: ReturnType<typeof useTracingConfig>['requests'],
  projectId = 'prj_test',
  teamId = 'team_dummy'
) {
  for (const request of requests) {
    expect(request.query).toEqual({ projectId, teamId });
  }
}
