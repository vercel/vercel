import type { ExperimentConfig } from '@vercel/agent-eval';
import { setupAuthAndConfig } from '../setup/auth-and-config';

const config: ExperimentConfig = {
  agent: 'vercel-ai-gateway/claude-code',
  evals: 'marketplace/*',
  runs: 3,
  earlyExit: true,
  timeout: 900,
  sandbox: 'docker',
  async setup(sandbox) {
    if (!process.env.VERCEL_TOKEN) {
      throw new Error('VERCEL_TOKEN is required for marketplace evals.');
    }

    await setupAuthAndConfig(sandbox);

    await sandbox.runCommand('npm', ['install', '-g', 'vercel@latest']);
  },
};

export default config;
