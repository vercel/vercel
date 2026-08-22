import fs from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

const {
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

vi.setConfig({
  testTimeout: 15 * 60 * 1000,
  hookTimeout: 15 * 60 * 1000,
});

const fixturesPath = path.resolve(__dirname, 'fixtures', 'ruby');
const fixtures = fs
  .readdirSync(fixturesPath, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort();

for (const fixture of fixtures) {
  it.concurrent(`should build ${fixture}`, async () => {
    await expect(
      testDeployment(path.join(fixturesPath, fixture))
    ).resolves.toBeDefined();
  });
}
