import { describe, it, expect, beforeEach, vi } from 'vitest';
import { client } from '../../../mocks/client';

const { mockList, mockMetricsIndex } = vi.hoisted(() => ({
  mockList: vi.fn().mockResolvedValue(0),
  mockMetricsIndex: vi.fn().mockResolvedValue(0),
}));

vi.mock('../../../../src/commands/experiment/list', () => ({
  default: mockList,
}));

vi.mock('../../../../src/commands/experiment/metrics-index', () => ({
  default: mockMetricsIndex,
}));

import experiment from '../../../../src/commands/experiment';

describe('experiment command routing', () => {
  beforeEach(() => {
    client.reset();
    mockList.mockClear();
    mockMetricsIndex.mockClear();
  });

  it('routes list to list handler', async () => {
    client.setArgv('experiment', 'list');
    await experiment(client);
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(mockList.mock.calls[0][0]).toBe(client);
    expect(mockList.mock.calls[0][1]).toEqual([]);
  });

  it('routes metrics to metrics handler', async () => {
    client.setArgv('experiment', 'metrics', 'ls');
    await experiment(client);
    expect(mockMetricsIndex).toHaveBeenCalledTimes(1);
    expect(mockMetricsIndex.mock.calls[0][0]).toBe(client);
  });
});
