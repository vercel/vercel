import { describe, it, expect, beforeEach } from 'vitest';
import experiment from '../../../../src/commands/experiment';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags } from '../../../mocks/flags';
import type { Flag } from '../../../../src/util/flags/types';

const draftExperimentFlag: Flag = {
  id: 'flag_draft',
  slug: 'run-me',
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
        base: { type: 'visitor' },
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
    primaryMetricIds: ['met_x'],
    status: 'draft',
    controlVariantId: 'control',
  },
};

describe('experiment start / stop', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'experiment-test',
    });
    useFlags([draftExperimentFlag]);
    client.cwd = setupUnitFixture('commands/flags/vercel-flags-test');
  });

  it('sets experiment to running with startedAt', async () => {
    client.setArgv('experiment', 'start', 'run-me', '--json');
    const exitCode = await experiment(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.flag.experiment?.status).toBe('running');
    expect(typeof parsed.flag.experiment?.startedAt).toBe('number');
  });

  it('sets experiment to closed with endedAt', async () => {
    client.setArgv('experiment', 'stop', 'run-me', '--json');
    const exitCode = await experiment(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.flag.experiment?.status).toBe('closed');
    expect(typeof parsed.flag.experiment?.endedAt).toBe('number');
  });
});
