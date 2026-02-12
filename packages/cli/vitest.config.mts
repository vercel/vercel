import { mergeConfig } from 'vite';
import rootConfig from '../../vitest.config.mjs';
import { readFileSync } from 'fs';

// Get peer dependencies to externalize them (they may not be installed in CI)
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const peerDeps = Object.keys(pkg.peerDependencies || {});

export default mergeConfig(rootConfig, {
  test: {
    setupFiles: ['./vitest.setup.mts'],
  },
  ssr: {
    // Externalize peer dependencies so Vite doesn't try to resolve them
    external: peerDeps,
  },
});
