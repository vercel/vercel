import type { ExperimentConfig } from '@vercel/agent-eval';
import { setupAuthAndConfig } from '../setup/auth-and-config';
import { installCLI } from '../setup/install-cli';

const config: ExperimentConfig = {
  agent: 'vercel-ai-gateway/claude-code',
  evals: ['_smoke'],
  runs: 1,
  earlyExit: false, // Run all evals to completion so we get explicit pass/fail for each
  timeout: 600,
  sandbox: 'vercel',
  setup: async sandbox => {
    await installCLI(sandbox);
    await setupAuthAndConfig(sandbox);
  },
};

export default config;
