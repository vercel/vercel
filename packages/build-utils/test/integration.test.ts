import path from 'path';
import fs from 'fs-extra';
import {
  testDeployment,
  // @ts-ignore
} from '../../../test/lib/deployment/test-deployment';
import { expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 4 * 60 * 1000 });

const fixturesPath = path.resolve(__dirname, 'fixtures');
const groupCount = 4;
const group = process.env.BUILD_UTILS_E2E_GROUP;
const groupIndex = group ? Number(group) - 1 : undefined;

// Fixtures that have separate tests and should be skipped in the loop
const skipFixtures: string[] = [
  '02-zero-config-api',
  '03-zero-config-angular',
  '04-zero-config-brunch',
  '05-zero-config-gatsby',
  '06-zero-config-hugo',
  '07-zero-config-jekyll',
  '08-zero-config-middleman',
  '19-yarn-v2',
  '21-npm-workspaces',
  '23-pnpm-workspaces',
  '41-turborepo-supporting-corepack-home',
  '42-turborepo-not-supporting-corepack-home',
  '43-turborepo-with-comments-in-turbo-json',
  '44-yarn-v4',
  '45-yarn-v1',
  '46-yarn-dynamic-require',
];

const deploymentTests = fs
  .readdirSync(fixturesPath)
  .filter(fixture => !skipFixtures.includes(fixture))
  .map(fixture => ({ fixture, fixturePath: path.join(fixturesPath, fixture) }));

// Test a few fixtures owned by other builders as well.
for (const builder of ['node']) {
  const builderFixturesPath = path.resolve(
    __dirname,
    `../../${builder}/test/fixtures`
  );

  for (const fixture of fs.readdirSync(builderFixturesPath)) {
    if (['01-cowsay', '01-cache-headers', '03-env-vars'].includes(fixture)) {
      deploymentTests.push({
        fixture: `${builder}/${fixture}`,
        fixturePath: path.join(builderFixturesPath, fixture),
      });
    }
  }
}

for (const [index, { fixture, fixturePath }] of deploymentTests.entries()) {
  if (groupIndex !== undefined && index % groupCount !== groupIndex) {
    continue;
  }

  it(`Should build "${fixture}"`, async () => {
    await expect(testDeployment(fixturePath)).resolves.toBeDefined();
  });
}
