import path from 'path';
import fs from 'fs-extra';
import {
  testDeployment,
  // @ts-ignore
} from '../../../test/lib/deployment/test-deployment';
import { expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 4 * 60 * 1000 });

const fixturesPath = path.resolve(__dirname, 'fixtures');

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
];

// eslint-disable-next-line no-restricted-syntax
for (const fixture of fs.readdirSync(fixturesPath)) {
  if (skipFixtures.includes(fixture)) {
    continue; // eslint-disable-line no-continue
  }

  // eslint-disable-next-line no-loop-func
  it(`Should build "${fixture}"`, async () => {
    await expect(
      testDeployment(path.join(fixturesPath, fixture))
    ).resolves.toBeDefined();
  });
}

// few foreign tests

const buildersToTestWith = ['node'];

// eslint-disable-next-line no-restricted-syntax
for (const builder of buildersToTestWith) {
  const fixturesPath2 = path.resolve(
    __dirname,
    `../../${builder}/test/fixtures`
  );

  // eslint-disable-next-line no-restricted-syntax
  for (const fixture of fs.readdirSync(fixturesPath2)) {
    // don't run all foreign fixtures, just some
    if (['01-cowsay', '01-cache-headers', '03-env-vars'].includes(fixture)) {
      // eslint-disable-next-line no-loop-func
      it(`Should build "${builder}/${fixture}"`, async () => {
        await expect(
          testDeployment(path.join(fixturesPath2, fixture))
        ).resolves.toBeDefined();
      });
    }
  }
}
