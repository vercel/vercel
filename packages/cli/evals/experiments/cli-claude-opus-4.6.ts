import { createCliExperimentConfig } from './cli';

const config = createCliExperimentConfig({
  agent: 'vercel-ai-gateway/claude-code',
  model: 'claude-opus-4-6',
  runs: 1,
  earlyExit: false,
  timeout: 900,
});

export default config;
