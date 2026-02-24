import type { ExperimentConfig } from '@vercel/agent-eval';
import { setupAuthAndConfig } from '../setup/auth-and-config';
import { installCLI } from '../setup/install-cli';

const config: ExperimentConfig = {
  agent: 'vercel-ai-gateway/claude-code',
  evals: ['_smoke'],
  runs: 1,
  earlyExit: false,
  timeout: 600,
  sandbox: 'docker', // Use docker so VERCEL_TOKEN works in CI (vercel sandbox requires OIDC)
  setup: async sandbox => {
    await installCLI(sandbox);
    await setupAuthAndConfig(sandbox);
  },
};

export default config;
