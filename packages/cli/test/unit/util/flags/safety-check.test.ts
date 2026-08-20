import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getFlagSafetyBlockers,
  getFlagSafetyRemediation,
} from '../../../../src/util/flags/safety-check';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';

describe('getFlagSafetyBlockers', () => {
  beforeEach(() => {
    process.env.VERCEL_FLAG_EVALUATIONS_API_URL = new URL(
      '/api/observability/metrics',
      client.apiUrl
    ).href;
    useUser();
    useTeams('team_dummy');
  });

  afterEach(() => {
    delete process.env.VERCEL_FLAG_EVALUATIONS_API_URL;
  });

  it('blocks when production evaluations are detected as numbers', async () => {
    client.scenario.post('/api/observability/metrics', (_req, res) => {
      res.json({
        data: [],
        summary: [{ vercel_flag_evaluation_flag_evaluations_sum: 5 }],
      });
    });
    client.scenario.get(
      '/projects/test-project/production-deployment',
      (_req, res) => {
        res.json({ deployment: { id: 'dpl_test' } });
      }
    );
    client.scenario.get(
      '/v1/deployments/dpl_test/feature-flags',
      (_req, res) => {
        res.json({ flags: [], status: { responseStatus: 200 } });
      }
    );

    const blockers = await getFlagSafetyBlockers({
      client,
      projectId: 'test-project',
      ownerId: 'team_dummy',
      slug: 'test-flag',
    });

    expect(blockers).toEqual([
      {
        kind: 'evaluations',
        message: '5 production evaluations in the last 72 hours',
      },
    ]);
  });

  it('blocks when production evaluations are detected as numeric strings', async () => {
    client.scenario.post('/api/observability/metrics', (_req, res) => {
      res.json({
        data: [],
        summary: [{ vercel_flag_evaluation_flag_evaluations_sum: '42' }],
      });
    });
    client.scenario.get(
      '/projects/test-project/production-deployment',
      (_req, res) => {
        res.json({ deployment: { id: 'dpl_test' } });
      }
    );
    client.scenario.get(
      '/v1/deployments/dpl_test/feature-flags',
      (_req, res) => {
        res.json({ flags: [], status: { responseStatus: 200 } });
      }
    );

    const blockers = await getFlagSafetyBlockers({
      client,
      projectId: 'test-project',
      ownerId: 'team_dummy',
      slug: 'test-flag',
    });

    expect(blockers).toEqual([
      {
        kind: 'evaluations',
        message: '42 production evaluations in the last 72 hours',
      },
    ]);
  });

  it('blocks when no active production deployment exists', async () => {
    client.scenario.post('/api/observability/metrics', (_req, res) => {
      res.json({ data: [], summary: [] });
    });
    client.scenario.get(
      '/projects/test-project/production-deployment',
      (_req, res) => {
        res.json({ deployment: null });
      }
    );

    const blockers = await getFlagSafetyBlockers({
      client,
      projectId: 'test-project',
      ownerId: 'team_dummy',
      slug: 'test-flag',
    });

    expect(blockers).toEqual([
      {
        kind: 'reference-unavailable',
        message: 'could not find the active production deployment',
      },
    ]);
  });

  it('blocks when deployment flag discovery has missing sync status', async () => {
    client.scenario.post('/api/observability/metrics', (_req, res) => {
      res.json({ data: [], summary: [] });
    });
    client.scenario.get(
      '/projects/test-project/production-deployment',
      (_req, res) => {
        res.json({ deployment: { id: 'dpl_test' } });
      }
    );
    client.scenario.get(
      '/v1/deployments/dpl_test/feature-flags',
      (_req, res) => {
        res.json({ flags: [], status: null });
      }
    );

    const blockers = await getFlagSafetyBlockers({
      client,
      projectId: 'test-project',
      ownerId: 'team_dummy',
      slug: 'test-flag',
    });

    expect(blockers).toEqual([
      {
        kind: 'reference-unavailable',
        message:
          'could not verify feature flag discovery status on the active production deployment',
      },
    ]);
  });

  it('blocks when deployment flag discovery has non-200 sync status', async () => {
    client.scenario.post('/api/observability/metrics', (_req, res) => {
      res.json({ data: [], summary: [] });
    });
    client.scenario.get(
      '/projects/test-project/production-deployment',
      (_req, res) => {
        res.json({ deployment: { id: 'dpl_test' } });
      }
    );
    client.scenario.get(
      '/v1/deployments/dpl_test/feature-flags',
      (_req, res) => {
        res.json({ flags: [], status: { responseStatus: 404 } });
      }
    );

    const blockers = await getFlagSafetyBlockers({
      client,
      projectId: 'test-project',
      ownerId: 'team_dummy',
      slug: 'test-flag',
    });

    expect(blockers).toEqual([
      {
        kind: 'reference-unavailable',
        message:
          'could not verify feature flag discovery status on the active production deployment',
      },
    ]);
  });

  it('blocks when deployment references the flag', async () => {
    client.scenario.post('/api/observability/metrics', (_req, res) => {
      res.json({ data: [], summary: [] });
    });
    client.scenario.get(
      '/projects/test-project/production-deployment',
      (_req, res) => {
        res.json({ deployment: { id: 'dpl_test' } });
      }
    );
    client.scenario.get(
      '/v1/deployments/dpl_test/feature-flags',
      (_req, res) => {
        res.json({
          flags: [{ slug: 'test-flag', projectMismatch: false }],
          status: { responseStatus: 200 },
        });
      }
    );

    const blockers = await getFlagSafetyBlockers({
      client,
      projectId: 'test-project',
      ownerId: 'team_dummy',
      slug: 'test-flag',
    });

    expect(blockers).toEqual([
      {
        kind: 'reference',
        message: 'the active production deployment still references this flag',
      },
    ]);
  });

  it('allows when no blockers are found', async () => {
    client.scenario.post('/api/observability/metrics', (_req, res) => {
      res.json({ data: [], summary: [] });
    });
    client.scenario.get(
      '/projects/test-project/production-deployment',
      (_req, res) => {
        res.json({ deployment: { id: 'dpl_test' } });
      }
    );
    client.scenario.get(
      '/v1/deployments/dpl_test/feature-flags',
      (_req, res) => {
        res.json({ flags: [], status: { responseStatus: 200 } });
      }
    );

    const blockers = await getFlagSafetyBlockers({
      client,
      projectId: 'test-project',
      ownerId: 'team_dummy',
      slug: 'test-flag',
    });

    expect(blockers).toEqual([]);
  });
});

describe('getFlagSafetyRemediation', () => {
  it('gives an evaluation-specific remediation', () => {
    expect(
      getFlagSafetyRemediation([
        { kind: 'evaluations', message: '1 production evaluation' },
      ])
    ).toBe('Wait for Production evaluation activity to stop, then try again.');
  });

  it('gives a deployment-reference-specific remediation', () => {
    expect(
      getFlagSafetyRemediation([
        { kind: 'reference', message: 'active deployment reference' },
      ])
    ).toBe(
      'Remove this flag from your application code and deploy the change to Production, then try again.'
    );
  });

  it('combines remediation when both checks detect usage', () => {
    expect(
      getFlagSafetyRemediation([
        { kind: 'evaluations', message: '1 production evaluation' },
        { kind: 'reference', message: 'active deployment reference' },
      ])
    ).toBe(
      'Remove this flag from your application code, deploy the change to Production, and wait for evaluation activity to stop, then try again.'
    );
  });

  it('uses a neutral remediation when safety checks are unavailable', () => {
    expect(
      getFlagSafetyRemediation([
        { kind: 'evaluations-unavailable', message: 'metrics unavailable' },
      ])
    ).toBe('Resolve the Production safety-check issues above, then try again.');
  });
});
