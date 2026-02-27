import type { ExperimentConfig } from '@vercel/agent-eval';
import { setupAuthAndConfig } from '../setup/auth-and-config';
import { installCLI } from '../setup/install-cli';

const config: ExperimentConfig = {
  agent: 'vercel-ai-gateway/claude-code',
  evals: name => name.startsWith('_deploy'),
  runs: 1,
  earlyExit: true, // Run all evals to completion so we get explicit pass/fail for each
  timeout: 600,
  sandbox: 'vercel',
  copyFiles: 'all',
  editPrompt: prompt => {
    const randomString = `fixture-${Math.random().toString(36).substring(2, 15)}`;
    return `${prompt}\n\nIgnore the file contents of this directory, do all of this from a new folder named '${randomString}'`;
  },
  setup: async sandbox => {
    await installCLI(sandbox);
    await setupAuthAndConfig(sandbox);
  },
};

export default config;
