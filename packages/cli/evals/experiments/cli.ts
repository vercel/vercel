import type { ExperimentConfig } from '@vercel/agent-eval';

/**
 * CLI evals experiment. Add eval fixtures under evals/ and configure
 * credentials (VERCEL_OIDC_TOKEN / AI_GATEWAY_API_KEY, etc.) to run.
 *
 * Setup writes evals-setup.json (teamId, projectId) for evals that need
 * link targets (e.g. non-interactive). Uses CLI_EVAL_TEAM_ID and
 * CLI_EVAL_PROJECT_ID from env.
 */
const config: ExperimentConfig = {
  agent: 'vercel-ai-gateway/claude-code',
  runs: 1,
  earlyExit: true,
  timeout: 600,
  setup: async sandbox => {
    const teamId = process.env.CLI_EVAL_TEAM_ID ?? '';
    const projectId = process.env.CLI_EVAL_PROJECT_ID ?? '';
    await sandbox.writeFiles({
      'evals-setup.json': JSON.stringify({ teamId, projectId }, null, 2),
    });
  },
};

export default config;
