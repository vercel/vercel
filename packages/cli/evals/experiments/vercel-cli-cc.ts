import type { ExperimentConfig } from '@vercel/agent-eval';
import { setupAuthAndConfig } from '../setup/auth-and-config';

const config: ExperimentConfig = {
  agent: 'vercel-ai-gateway/claude-code',
  // Marketplace evals are hard-disabled (see evals/disabled-evals.ts).
  // Restore 'marketplace/*' only after the teardown deletes only resources
  // it created and disabled-evals.ts is updated.
  evals: [],
  runs: 3,
  earlyExit: true,
  timeout: 900,
  sandbox: 'docker',
  async setup(sandbox) {
    if (!process.env.VERCEL_TOKEN) {
      throw new Error('VERCEL_TOKEN is required for marketplace evals.');
    }

    // Team guard: setupAuthAndConfig verifies the token is scoped to ONLY
    // the dedicated evals team before it reaches the sandbox.
    await setupAuthAndConfig(sandbox);

    await sandbox.runCommand('npm', ['install', '-g', 'vercel@latest']);
  },
};

export default config;
