import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import experiment from '../../../../src/commands/experiment';
import * as experimentList from '../../../../src/commands/experiment/list';
import * as metricsIndex from '../../../../src/commands/experiment/metrics-index';
import { client } from '../../../mocks/client';

describe('experiment command routing', () => {
  const listSpy = vi.spyOn(experimentList, 'default').mockResolvedValue(0);
  const metricsSpy = vi.spyOn(metricsIndex, 'default').mockResolvedValue(0);

  afterEach(() => {
    listSpy.mockClear();
    metricsSpy.mockClear();
  });

  beforeEach(() => {
    client.reset();
  });

  it('routes list to list handler', async () => {
    client.setArgv('experiment', 'list');
    await experiment(client);
    expect(listSpy).toHaveBeenCalledWith(client, []);
  });

  it('routes metrics to metrics handler', async () => {
    client.setArgv('experiment', 'metrics', 'ls');
    await experiment(client);
    expect(metricsSpy).toHaveBeenCalledWith(client);
  });
});
