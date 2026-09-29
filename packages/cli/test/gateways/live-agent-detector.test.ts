import { beforeEach, describe, expect, it, vi } from 'vitest';
import { determineAgent } from '@vercel/detect-agent';
import { liveAgentDetector } from '../../src/gateways/agent-detector';

vi.mock('@vercel/detect-agent', () => ({ determineAgent: vi.fn() }));

describe('liveAgentDetector', () => {
  beforeEach(() => {
    vi.mocked(determineAgent).mockReset();
  });

  it('reports the detected agent name', async () => {
    vi.mocked(determineAgent).mockResolvedValue({
      isAgent: true,
      agent: { name: 'claude' },
    } as Awaited<ReturnType<typeof determineAgent>>);

    await expect(liveAgentDetector().detect()).resolves.toEqual({
      isAgent: true,
      agentName: 'claude',
    });
  });

  it('reports no agent', async () => {
    vi.mocked(determineAgent).mockResolvedValue({
      isAgent: false,
      agent: undefined,
    } as Awaited<ReturnType<typeof determineAgent>>);

    await expect(liveAgentDetector().detect()).resolves.toEqual({
      isAgent: false,
      agentName: undefined,
    });
  });
});
