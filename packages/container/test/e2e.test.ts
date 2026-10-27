import path from 'node:path';
import { beforeAll, it } from 'vitest';

const {
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

beforeAll(() => {
  if (!process.env.VERCEL_CLI_VERSION) {
    throw new Error(
      'Set VERCEL_CLI_VERSION to the preview CLI tarball for this branch before running buildpack deployment tests.'
    );
  }
});

// Concurrent fixtures need unique project names across runtimes. By default,
// the project name is the fixture directory name, unless vercel.json overrides it.
const fixtures: Record<string, string[]> = {
  ruby: ['00-rack', '01-rails-esbuild', '02-services', '03-rails-welcome'],
  go: ['00-net-http', '01-gin', '02-chi', '03-vendor', '04-services'],
  rust: ['00-http', '01-axum', '02-services'],
};

// The fixtures deploy concurrently, so wall-clock time is roughly one
// deployment (about 4 minutes in CI). Cap the worst case: a fixture that hangs
// rather than failing fast gets one retry of 10 minutes, keeping the run within
// the CI step budget instead of the shared `retry: 3` × 12-minute default.
for (const [runtime, names] of Object.entries(fixtures)) {
  for (const fixture of names) {
    it.concurrent(
      `deploys ${runtime} ${fixture}`,
      { timeout: 10 * 60 * 1000, retry: 1 },
      async () => {
        await testDeployment(
          path.join(__dirname, 'fixtures', runtime, fixture)
        );
      }
    );
  }
}
