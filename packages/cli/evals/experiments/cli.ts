import type { ExperimentConfig } from '@vercel/agent-eval';

/**
 * CLI evals experiment. Add eval fixtures under evals/ and configure
 * credentials (VERCEL_OIDC_TOKEN / AI_GATEWAY_API_KEY, etc.) to run.
 */
const config: ExperimentConfig = {
  agent: 'vercel-ai-gateway/claude-code',
  runs: 1,
  earlyExit: true,
  timeout: 600,
};

export default config;
