import { createCliExperimentConfig } from './cli';

const config = createCliExperimentConfig({
  agent: 'vercel-ai-gateway/codex',
  model: 'gpt-5.4?reasoningEffort=medium',
  runs: 1,
  earlyExit: false,
  timeout: 900,
});

export default config;
