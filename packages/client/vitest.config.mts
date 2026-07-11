import { mergeConfig } from 'vite';
import rootConfig from '../../vitest.config.mts';

export default mergeConfig(rootConfig, {
  test: {
    setupFiles: ['./vitest.setup.mts'],
  },
});
