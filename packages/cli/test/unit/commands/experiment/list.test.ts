import { describe, it, expect, beforeEach } from 'vitest';
import experiment from '../../../../src/commands/experiment';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags } from '../../../mocks/flags';
import type { Flag } from '../../../../src/util/flags/types';

const experimentFlag: Flag = {
  id: 'flag_with_exp',
  slug: 'signup-exp',
  kind: 'json',
  state: 'active',
  description: 'A/B signup',
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
  seed: 42,
  typeName: 'flag',
  experiment: {
    allocationUnit: 'visitorId',
    primaryMetrics: [
      {
        name: 'Test metric',
        metricType: 'count',
        metricUnit: 'user',
        directionality: 'increaseIsGood',
      },
    ],
    status: 'draft',
  },
};

describe('experiment list', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'experiment-test',
    });
    useFlags([experimentFlag]);
    client.cwd = setupUnitFixture('commands/flags/vercel-flags-test');
  });

  it('returns only flags with experiment config when using hasExperiment', async () => {
    client.setArgv('experiment', 'list', '--json');
    const exitCode = await experiment(client);
    expect(exitCode).toBe(0);
    const out = client.stdout.getFullOutput();
    const parsed = JSON.parse(out);
    expect(parsed.experiments).toHaveLength(1);
    expect(parsed.experiments[0].slug).toBe('signup-exp');
    expect(parsed.experiments[0].experiment?.status).toBe('draft');
  });
});
