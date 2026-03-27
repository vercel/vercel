import { describe, it, expect, beforeEach } from 'vitest';
import experiment from '../../../../src/commands/experiment';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags } from '../../../mocks/flags';

describe('experiment create', () => {
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

  it('creates a draft json experiment flag', async () => {
    client.setArgv(
      'experiment',
      'create',
      'new-flow',
      '--metric',
      '{"name":"Primary KPI","metricType":"count","metricUnit":"user","directionality":"increaseIsGood"}',
      '--allocation-unit',
      'visitorId',
      '--hypothesis',
      'Better conversion',
      '--json'
    );
    const exitCode = await experiment(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.flag.slug).toBe('new-flow');
    expect(parsed.flag.kind).toBe('json');
    expect(parsed.flag.experiment?.status).toBe('draft');
    expect(parsed.flag.experiment?.primaryMetrics).toHaveLength(1);
    expect(parsed.flag.experiment?.primaryMetrics?.[0]).toMatchObject({
      name: 'Primary KPI',
      metricType: 'count',
      metricUnit: 'user',
      directionality: 'increaseIsGood',
    });
    expect(parsed.flag.environments.production.fallthrough.base).toMatchObject({
      type: 'entity',
      kind: 'visitor',
      attribute: 'id',
    });
  });

  it('maps cookieId allocation unit to cookie entity', async () => {
    client.setArgv(
      'experiment',
      'create',
      'cookie-test',
      '--metric',
      '{"name":"CTR","metricType":"percentage","metricUnit":"visitor","directionality":"increaseIsGood"}',
      '--allocation-unit',
      'cookieId',
      '--json'
    );
    const exitCode = await experiment(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.flag.environments.production.fallthrough.base).toMatchObject({
      type: 'entity',
      kind: 'cookie',
      attribute: 'id',
    });
  });

  it('maps userId allocation unit to user entity', async () => {
    client.setArgv(
      'experiment',
      'create',
      'user-test',
      '--metric',
      '{"name":"Revenue","metricType":"currency","metricUnit":"user","directionality":"increaseIsGood"}',
      '--allocation-unit',
      'userId',
      '--json'
    );
    const exitCode = await experiment(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.flag.environments.production.fallthrough.base).toMatchObject({
      type: 'entity',
      kind: 'user',
      attribute: 'id',
    });
  });
});
