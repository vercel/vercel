import { describe, it, expect, beforeEach } from 'vitest';
import experiment from '../../../../src/commands/experiment';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags } from '../../../mocks/flags';

describe('experiment metrics', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'experiment-test',
    });
    useFlags();
    client.cwd = setupUnitFixture('commands/flags/vercel-flags-test');
  });

  it('add creates a metric', async () => {
    client.setArgv(
      'experiment',
      'metrics',
      'add',
      '--slug',
      'signup-done',
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
    expect(parsed.metric.slug).toBe('signup-done');
    expect(parsed.metric.metricType).toBe('count');
  });

  it('list returns metrics', async () => {
    client.setArgv(
      'experiment',
      'metrics',
      'add',
      '--slug',
      'purchase',
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

    client.setArgv('experiment', 'metrics', 'list', '--json');
    const exitCode = await experiment(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.metrics.length).toBeGreaterThanOrEqual(1);
    expect(
      parsed.metrics.some((m: { slug: string }) => m.slug === 'purchase')
    ).toBe(true);
  });
});
