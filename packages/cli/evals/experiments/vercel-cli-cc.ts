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
    await setupAuthAndConfig(sandbox);

    await sandbox.runCommand('npm', ['install', '-g', 'vercel@latest']);
  },
};

export default config;
