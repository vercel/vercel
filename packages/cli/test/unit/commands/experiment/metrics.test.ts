import { describe, it, expect, beforeEach } from 'vitest';
import experiment from '../../../../src/commands/experiment';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags } from '../../../mocks/flags';
import type { Flag } from '../../../../src/util/flags/types';

const draftFlagWithExperiment: Flag = {
  id: 'flag_metrics',
  slug: 'metrics-test-flag',
  kind: 'json',
  state: 'active',
  variants: [
    { id: 'control', value: { variantId: 'control', params: {} } },
    { id: 'treatment', value: { variantId: 'treatment', params: {} } },
  ],
  environments: {
    production: {
      active: true,
      pausedOutcome: { type: 'variant', variantId: 'control' },
      rules: [],
      fallthrough: {
        type: 'split',
        base: { type: 'entity', kind: 'visitor', attribute: 'id' },
        weights: { control: 50, treatment: 50 },
        defaultVariantId: 'control',
      },
    },
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
  createdBy: 'user_123',
  projectId: 'vercel-flags-test',
  ownerId: 'team_dummy',
  revision: 1,
  seed: 1,
  typeName: 'flag',
  experiment: {
    allocationUnit: 'visitorId',
    primaryMetrics: [
      {
        name: 'First',
        metricType: 'count',
        metricUnit: 'user',
        directionality: 'increaseIsGood',
      },
    ],
    status: 'draft',
    controlVariantId: 'control',
  },
};

describe('experiment metrics', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'experiment-test',
    });
    useFlags([draftFlagWithExperiment]);
    client.cwd = setupUnitFixture('commands/flags/vercel-flags-test');
  });

  it('add appends a primary metric via PATCH flag', async () => {
    client.setArgv(
      'experiment',
      'metrics',
      'add',
      '--flag',
      'metrics-test-flag',
      '--name',
      'Signup done',
      '--metric-type',
      'count',
      '--metric-unit',
      'user',
      '--directionality',
      'increaseIsGood',
      '--json'
    );
    const exitCode = await experiment(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.metric.name).toBe('Signup done');
    expect(parsed.metric.metricType).toBe('count');
    expect(parsed.flag).toBe('metrics-test-flag');
  });

  it('list returns metrics for the flag experiment', async () => {
    client.setArgv(
      'experiment',
      'metrics',
      'add',
      '--flag',
      'metrics-test-flag',
      '--name',
      'Purchase',
      '--metric-type',
      'count',
      '--metric-unit',
      'visitor',
      '--directionality',
      'increaseIsGood'
    );
    await experiment(client);

    client.setArgv(
      'experiment',
      'metrics',
      'list',
      'metrics-test-flag',
      '--json'
    );
    const exitCode = await experiment(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.primary.length).toBeGreaterThanOrEqual(1);
    expect(
      parsed.primary.some(
        (m: { name: string }) => m.name === 'Purchase' || m.name === 'First'
      )
    ).toBe(true);
  });
});
