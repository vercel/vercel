import type { ExperimentConfig } from '@vercel/agent-eval';
import cliConfig from './cli';

const config: ExperimentConfig = {
  ...cliConfig,
  evals: ['build'],
};

export default config;
