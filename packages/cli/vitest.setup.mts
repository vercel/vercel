import { beforeAll, vi } from 'vitest';
import output from './src/output-manager';

// Tests must be deterministic: always use the pinned frameworks manifest
// instead of fetching the remote one.
process.env.VERCEL_SKIP_REMOTE_FRAMEWORKS = '1';

beforeAll(() => {
  output.initialize({
    supportsHyperlink: false,
    noColor: true,
  });
});

if (process.debugPort) {
  // when debugging in an IDE, set a high timeout
  vi.setConfig({ testTimeout: 10 * 60 * 1000 });
}
