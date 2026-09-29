import { determineAgent } from '@vercel/detect-agent';

export type AgentDetection = { isAgent: boolean; agentName?: string };

/** Detects whether the CLI runs under an AI agent. */
export type AgentDetector = { detect(): Promise<AgentDetection> };

export function liveAgentDetector(): AgentDetector {
  return {
    async detect() {
      const { isAgent, agent } = await determineAgent();
      return { isAgent, agentName: agent?.name };
    },
  };
}
