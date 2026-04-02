import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import metrics from '../../../../src/commands/metrics';

vi.mock('../../../../src/commands/metrics/query', () => ({
  default: vi.fn().mockResolvedValue(0),
}));

vi.mock('../../../../src/commands/metrics/schema', () => ({
  default: vi.fn().mockResolvedValue(0),
}));

describe('metrics index v2', () => {
  beforeEach(() => {
    client.reset();
  });

  it('routes schema subcommand', async () => {
    client.setArgv('metrics', 'schema');
    expect(await metrics(client)).toBe(0);
  });

  it('shows help when no --metric is provided for query', async () => {
    client.setArgv('metrics');
    expect(await metrics(client)).toBe(2);
  });
});
