import { createCliExperimentConfig } from './cli';

const config = createCliExperimentConfig({
  agent: 'vercel-ai-gateway/codex',
  model: 'openai/gpt-5.5-pro',
  runs: 1,
  earlyExit: false,
  timeout: 1800,
});

export default config;
