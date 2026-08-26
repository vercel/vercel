import { mergeConfig } from 'vite';
import rootConfig from '../../vitest.config.mts';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { generateConfigValidator } from './scripts/precompile-config-validator.mjs';

// Get peer dependencies to externalize them (they may not be installed in CI)
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const peerDeps = Object.keys(pkg.peerDependencies || {});

/**
 * Load `.md` imports as strings, matching the esbuild `text` loader used by the
 * production build (see `scripts/build.mjs`). Agent instruction files live as
 * markdown in source so they can be reviewed as prose and diffed in pull
 * requests; tests must see the same content the shipped CLI does.
 */
const markdownAsText = {
  name: 'vercel-markdown-as-text',
  transform(code: string, id: string) {
    if (!id.endsWith('.md')) return null;
    return {
      code: `export default ${JSON.stringify(code)};`,
      map: null,
    };
  },
};

export default mergeConfig(rootConfig, {
  plugins: [markdownAsText],
  // Exercise the same precompiled validator that the production build ships.
  resolve: {
    alias: {
      './config-validator': await generateConfigValidator(),
    },
  },
  test: {
    setupFiles: ['./vitest.setup.mts'],
  },
  ssr: {
    // Externalize peer dependencies so Vite doesn't try to resolve them
    external: peerDeps,
  },
});
