import { defineConfig } from 'vitest/config';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    pool: 'forks',
    include: [join(here, 'test/**/*.test.ts')],
    testTimeout: 60_000,
  },
});
