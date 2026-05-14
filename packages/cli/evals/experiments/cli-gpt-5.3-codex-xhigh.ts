import { createCliExperimentConfig } from './cli';

const config = createCliExperimentConfig({
  agent: 'codex',
  model: 'gpt-5.3-codex?reasoningEffort=xhigh',
  runs: 1,
  earlyExit: false,
  timeout: 900,
});

export default config;
