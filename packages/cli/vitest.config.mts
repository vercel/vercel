import { mergeConfig } from 'vite';
import rootConfig from '../../vitest.config.mjs';

export default mergeConfig(rootConfig, {
  test: {
    setupFiles: ['./vitest.setup.mts'],
  },
});
