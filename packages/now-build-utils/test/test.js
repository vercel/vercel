/* global beforeAll, expect, it, jest */
const path = require('path');
const fs = require('fs-extra');
// eslint-disable-next-line import/no-extraneous-dependencies
const execa = require('execa');
const assert = require('assert');
const { glob, download } = require('../');
const { createZip } = require('../dist/lambda');
const {
  getSupportedNodeVersion,
  defaultSelection,
} = require('../dist/fs/node-version');

const {
  packAndDeploy,
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(4 * 60 * 1000);
const builderUrl = '@canary';
let buildUtilsUrl;

beforeAll(async () => {
  const buildUtilsPath = path.resolve(__dirname, '..');
  buildUtilsUrl = await packAndDeploy(buildUtilsPath);
  console.log('buildUtilsUrl', buildUtilsUrl);
});

// unit tests

it('should re-create symlinks properly', async () => {
  const files = await glob('**', path.join(__dirname, 'symlinks'));
  assert.equal(Object.keys(files).length, 2);

  const outDir = path.join(__dirname, 'symlinks-out');
  await fs.remove(outDir);

  const files2 = await download(files, outDir);
  assert.equal(Object.keys(files2).length, 2);

  const [linkStat, aStat] = await Promise.all([
    fs.lstat(path.join(outDir, 'link.txt')),
    fs.lstat(path.join(outDir, 'a.txt')),
  ]);
  assert(linkStat.isSymbolicLink());
  assert(aStat.isFile());
});

it('should create zip files with symlinks properly', async () => {
  const files = await glob('**', path.join(__dirname, 'symlinks'));
  assert.equal(Object.keys(files).length, 2);

  const outFile = path.join(__dirname, 'symlinks.zip');
  await fs.remove(outFile);

  const outDir = path.join(__dirname, 'symlinks-out');
  await fs.remove(outDir);
  await fs.mkdirp(outDir);

  await fs.writeFile(outFile, await createZip(files));
  await execa('unzip', [outFile], { cwd: outDir });

  const [linkStat, aStat] = await Promise.all([
    fs.lstat(path.join(outDir, 'link.txt')),
    fs.lstat(path.join(outDir, 'a.txt')),
  ]);
  assert(linkStat.isSymbolicLink());
  assert(aStat.isFile());
});

async function getNodeMajor(engines) {
  const o = await getSupportedNodeVersion(engines);
  return o.major;
}

it('should only match supported node versions or fallback to default', async () => {
  expect(await getNodeMajor('10.x')).toBe(10);
  expect(await getNodeMajor('8.x')).toBe(8);
  expect(await getSupportedNodeVersion('6.x')).toBe(defaultSelection);
  expect(await getSupportedNodeVersion('64.x')).toBe(defaultSelection);
  expect(await getSupportedNodeVersion('')).toBe(defaultSelection);
  expect(await getSupportedNodeVersion(null)).toBe(defaultSelection);
  expect(await getSupportedNodeVersion(undefined)).toBe(defaultSelection);
});

it('should match all semver ranges', async () => {
  // See https://docs.npmjs.com/files/package.json#engines
  expect(await getNodeMajor('10.0.0')).toBe(10);
  expect(await getNodeMajor('10.x')).toBe(10);
  expect(await getNodeMajor('>=10')).toBe(10);
  expect(await getNodeMajor('>=10.3.0')).toBe(10);
  expect(await getNodeMajor('8.5.0 - 10.5.0')).toBe(10);
  expect(await getNodeMajor('>=9.0.0')).toBe(10);
  expect(await getNodeMajor('>=9.5.0 <=10.5.0')).toBe(10);
  expect(await getNodeMajor('~10.5.0')).toBe(10);
  expect(await getNodeMajor('^10.5.0')).toBe(10);
});

// own fixtures

const fixturesPath = path.resolve(__dirname, 'fixtures');

// eslint-disable-next-line no-restricted-syntax
for (const fixture of fs.readdirSync(fixturesPath)) {
  // eslint-disable-next-line no-loop-func
  it(`should build ${fixture}`, async () => {
    await expect(
      testDeployment(
        { builderUrl, buildUtilsUrl },
        path.join(fixturesPath, fixture),
      ),
    ).resolves.toBeDefined();
  });
}

// few foreign tests

const buildersToTestWith = ['now-node-server', 'now-static-build'];

// eslint-disable-next-line no-restricted-syntax
for (const builder of buildersToTestWith) {
  const fixturesPath2 = path.resolve(
    __dirname,
    `../../${builder}/test/fixtures`,
  );

  // eslint-disable-next-line no-restricted-syntax
  for (const fixture of fs.readdirSync(fixturesPath2)) {
    // don't run all foreign fixtures, just some
    if (['01-cowsay', '03-env-vars'].includes(fixture)) {
      // eslint-disable-next-line no-loop-func
      it(`should build ${builder}/${fixture}`, async () => {
        await expect(
          testDeployment(
            { builderUrl, buildUtilsUrl },
            path.join(fixturesPath2, fixture),
          ),
        ).resolves.toBeDefined();
      });
    }
  }
}
