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

  it('uses default variant values with full experiment structure when --control-value and --treatment-value are omitted', async () => {
    client.setArgv(
      'experiment',
      'create',
      'default-values',
      '--metric',
      '{"name":"Signup","metricType":"count","metricUnit":"user","directionality":"increaseIsGood"}',
      '--allocation-unit',
      'visitorId',
      '--json'
    );
    const exitCode = await experiment(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.flag.variants).toEqual([
      {
        id: 'control',
        value: {
          unitType: 'visitorId',
          experimentId: 'default-values',
          variantId: 'control',
          isControl: true,
          params: {},
        },
      },
      {
        id: 'treatment',
        value: {
          unitType: 'visitorId',
          experimentId: 'default-values',
          variantId: 'treatment',
          isControl: false,
          params: {},
        },
      },
    ]);
  });

  it('defaults reflect allocation unit in variant values', async () => {
    client.setArgv(
      'experiment',
      'create',
      'cookie-defaults',
      '--metric',
      '{"name":"CTR","metricType":"percentage","metricUnit":"visitor","directionality":"increaseIsGood"}',
      '--allocation-unit',
      'cookieId',
      '--json'
    );
    const exitCode = await experiment(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.flag.variants[0].value.unitType).toBe('cookieId');
    expect(parsed.flag.variants[1].value.unitType).toBe('cookieId');
  });

  it('accepts custom JSON variant values via --control-value and --treatment-value', async () => {
    client.setArgv(
      'experiment',
      'create',
      'custom-json',
      '--metric',
      '{"name":"CTR","metricType":"percentage","metricUnit":"visitor","directionality":"increaseIsGood"}',
      '--control-value',
      '{"unitType":"visitorId","experimentId":"e1","variantId":"v0","isControl":true,"params":{"color":"blue","layout":"grid"}}',
      '--treatment-value',
      '{"unitType":"visitorId","experimentId":"e1","variantId":"v1","isControl":false,"params":{"color":"green","layout":"list"}}',
      '--json'
    );
    const exitCode = await experiment(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.flag.variants).toEqual([
      {
        id: 'control',
        value: {
          unitType: 'visitorId',
          experimentId: 'e1',
          variantId: 'v0',
          isControl: true,
          params: { color: 'blue', layout: 'grid' },
        },
      },
      {
        id: 'treatment',
        value: {
          unitType: 'visitorId',
          experimentId: 'e1',
          variantId: 'v1',
          isControl: false,
          params: { color: 'green', layout: 'list' },
        },
      },
    ]);
  });

  it('accepts only --control-value and uses default for treatment', async () => {
    client.setArgv(
      'experiment',
      'create',
      'partial-control',
      '--metric',
      '{"name":"Signup","metricType":"count","metricUnit":"user","directionality":"increaseIsGood"}',
      '--control-value',
      '{"unitType":"visitorId","experimentId":"e1","variantId":"v0","isControl":true,"params":{"theme":"dark"}}',
      '--json'
    );
    const exitCode = await experiment(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.flag.variants[0].value).toEqual({
      unitType: 'visitorId',
      experimentId: 'e1',
      variantId: 'v0',
      isControl: true,
      params: { theme: 'dark' },
    });
    expect(parsed.flag.variants[1].value).toMatchObject({
      unitType: 'visitorId',
      experimentId: 'partial-control',
      variantId: 'treatment',
      isControl: false,
      params: {},
    });
  });

  it('accepts only --treatment-value and uses default for control', async () => {
    client.setArgv(
      'experiment',
      'create',
      'partial-treatment',
      '--metric',
      '{"name":"Signup","metricType":"count","metricUnit":"user","directionality":"increaseIsGood"}',
      '--treatment-value',
      '{"unitType":"visitorId","experimentId":"e1","variantId":"v1","isControl":false,"params":{"cta":"Buy Now"}}',
      '--json'
    );
    const exitCode = await experiment(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.flag.variants[0].value).toMatchObject({
      unitType: 'visitorId',
      experimentId: 'partial-treatment',
      variantId: 'control',
      isControl: true,
      params: {},
    });
    expect(parsed.flag.variants[1].value).toEqual({
      unitType: 'visitorId',
      experimentId: 'e1',
      variantId: 'v1',
      isControl: false,
      params: { cta: 'Buy Now' },
    });
  });

  it('rejects invalid JSON in --control-value', async () => {
    client.setArgv(
      'experiment',
      'create',
      'bad-control',
      '--metric',
      '{"name":"Signup","metricType":"count","metricUnit":"user","directionality":"increaseIsGood"}',
      '--control-value',
      'not-json'
    );
    const exitCode = await experiment(client);
    expect(exitCode).toBe(1);
  });

  it('rejects invalid JSON in --treatment-value', async () => {
    client.setArgv(
      'experiment',
      'create',
      'bad-treatment',
      '--metric',
      '{"name":"Signup","metricType":"count","metricUnit":"user","directionality":"increaseIsGood"}',
      '--treatment-value',
      '{broken'
    );
    const exitCode = await experiment(client);
    expect(exitCode).toBe(1);
  });

  it('uses custom variant ids with custom values', async () => {
    client.setArgv(
      'experiment',
      'create',
      'custom-ids-and-values',
      '--metric',
      '{"name":"Signup","metricType":"count","metricUnit":"user","directionality":"increaseIsGood"}',
      '--control-variant',
      'baseline',
      '--treatment-variant',
      'challenger',
      '--control-value',
      '{"unitType":"visitorId","experimentId":"e1","variantId":"v0","isControl":true,"params":{"price":9.99}}',
      '--treatment-value',
      '{"unitType":"visitorId","experimentId":"e1","variantId":"v1","isControl":false,"params":{"price":7.99}}',
      '--json'
    );
    const exitCode = await experiment(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.flag.variants).toEqual([
      {
        id: 'baseline',
        value: {
          unitType: 'visitorId',
          experimentId: 'e1',
          variantId: 'v0',
          isControl: true,
          params: { price: 9.99 },
        },
      },
      {
        id: 'challenger',
        value: {
          unitType: 'visitorId',
          experimentId: 'e1',
          variantId: 'v1',
          isControl: false,
          params: { price: 7.99 },
        },
      },
    ]);
  });
});
