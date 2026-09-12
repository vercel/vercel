import { mergeConfig } from 'vite';
import rootConfig from '../../vitest.config.mts';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { generateConfigValidator } from './scripts/precompile-config-validator.mjs';

// Get peer dependencies to externalize them (they may not be installed in CI)
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const peerDeps = Object.keys(pkg.peerDependencies || {});
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
const supportsVlt = nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 22);
const vltTests = [
  'test/unit/builders/vlt-builder-importer.test.ts',
  'test/unit/builders/vlt-builder-reify.test.ts',
  'test/unit/scripts/generate-builder-graph.test.ts',
];

export default mergeConfig(rootConfig, {
  // Exercise the same precompiled validator that the production build ships.
  resolve: {
    alias: {
      './config-validator': await generateConfigValidator(),
    },
  },
  test: {
    setupFiles: ['./vitest.setup.mts'],
    exclude: supportsVlt ? [] : vltTests,
  },
  ssr: {
    // Externalize peer dependencies so Vite doesn't try to resolve them
    external: peerDeps,
  },
});
