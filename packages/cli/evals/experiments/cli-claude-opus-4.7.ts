import { createCliExperimentConfig } from './cli';

const config = createCliExperimentConfig({
  agent: 'claude-code',
  model: 'claude-opus-4-7',
  runs: 1,
  earlyExit: false,
  timeout: 900,
});

export default config;
