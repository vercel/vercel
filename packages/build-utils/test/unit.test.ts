import ms from 'ms';
import path from 'path';
import fs from 'fs-extra';
import { strict as assert } from 'assert';
import { getSupportedNodeVersion } from '../src/fs/node-version';
import {
  FileBlob,
  getNodeVersion,
  getLatestNodeVersion,
  getDiscontinuedNodeVersions,
  rename,
  runNpmInstall,
  runPackageJsonScript,
  scanParentDirs,
  Prerender,
} from '../src';
import type { Files } from '../src';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 10 * 1000 });

async function expectBuilderError(promise: Promise<any>, pattern: string) {
  let result;
  try {
    result = await promise;
  } catch (error) {
    result = error;
  }
  assert('message' in result, `Expected error message but found ${result}`);
  assert(
    typeof result.message === 'string',
    `Expected error to be a string but found ${typeof result.message}`
  );
  assert(
    result.message.includes(pattern),
    `Expected ${pattern} but found "${result.message}"`
  );
}

let warningMessages: string[];
const originalConsoleWarn = console.warn;
beforeEach(() => {
  warningMessages = [];
  console.warn = m => {
    warningMessages.push(m);
  };
});

afterEach(() => {
  console.warn = originalConsoleWarn;
});

it('should only match supported node versions, otherwise throw an error', async () => {
  expect(await getSupportedNodeVersion('18.x', false)).toHaveProperty(
    'major',
    18
  );

  const autoMessage =
    'Please set Node.js Version to 22.x in your Project Settings to use Node.js 22.';
  await expectBuilderError(
    getSupportedNodeVersion('8.11.x', true),
    autoMessage
  );
  await expectBuilderError(getSupportedNodeVersion('6.x', true), autoMessage);
  await expectBuilderError(getSupportedNodeVersion('999.x', true), autoMessage);
  await expectBuilderError(getSupportedNodeVersion('foo', true), autoMessage);
  await expectBuilderError(getSupportedNodeVersion('=> 10', true), autoMessage);
  await expectBuilderError(
    getSupportedNodeVersion('=> 16.x', true),
    autoMessage
  );

  expect(await getSupportedNodeVersion('18.x', true)).toHaveProperty(
    'major',
    18
  );

  const foundMessage =
    'Please set "engines": { "node": "22.x" } in your `package.json` file to use Node.js 22.';
  await expectBuilderError(
    getSupportedNodeVersion('8.11.x', false),
    foundMessage
  );
  await expectBuilderError(getSupportedNodeVersion('6.x', false), foundMessage);
  await expectBuilderError(
    getSupportedNodeVersion('999.x', false),
    foundMessage
  );
  await expectBuilderError(getSupportedNodeVersion('foo', false), foundMessage);
  await expectBuilderError(
    getSupportedNodeVersion('=> 10', false),
    foundMessage
  );
});

// https://linear.app/vercel/issue/ZERO-3238/unskip-tests-failing-due-to-node-16-removal
// eslint-disable-next-line jest/no-disabled-tests
it.skip('should match all semver ranges', async () => {
  // See https://docs.npmjs.com/files/package.json#engines
  expect(await getSupportedNodeVersion('16.0.0')).toHaveProperty('major', 16);
  expect(await getSupportedNodeVersion('16.x')).toHaveProperty('major', 16);
  expect(await getSupportedNodeVersion('>=10')).toHaveProperty('major', 22);
  expect(await getSupportedNodeVersion('>=10.3.0')).toHaveProperty('major', 22);
  expect(await getSupportedNodeVersion('16.5.0 - 16.9.0')).toHaveProperty(
    'major',
    16
  );
  expect(await getSupportedNodeVersion('>=9.5.0 <=16.5.0')).toHaveProperty(
    'major',
    16
  );
  expect(await getSupportedNodeVersion('~16.5.0')).toHaveProperty('major', 16);
  expect(await getSupportedNodeVersion('^16.5.0')).toHaveProperty('major', 16);
  expect(await getSupportedNodeVersion('16.5.0 - 16.20.0')).toHaveProperty(
    'major',
    16
  );
});

it('should allow nodejs18.x', async () => {
  expect(await getSupportedNodeVersion('18.x')).toHaveProperty('major', 18);
  expect(await getSupportedNodeVersion('18')).toHaveProperty('major', 18);
  expect(await getSupportedNodeVersion('18.1.0')).toHaveProperty('major', 18);
});

it('should allow nodejs20.x', async () => {
  expect(await getSupportedNodeVersion('20.x')).toHaveProperty('major', 20);
  expect(await getSupportedNodeVersion('20')).toHaveProperty('major', 20);
  expect(await getSupportedNodeVersion('20.1.0')).toHaveProperty('major', 20);
});

it('should allow nodejs22.x', async () => {
  expect(getLatestNodeVersion()).toHaveProperty('major', 22);
  expect(await getSupportedNodeVersion('22.x')).toHaveProperty('major', 22);
  expect(await getSupportedNodeVersion('22')).toHaveProperty('major', 22);
  expect(await getSupportedNodeVersion('22.1.0')).toHaveProperty('major', 22);
  expect(await getSupportedNodeVersion('>=18')).toHaveProperty('major', 22);
});

it('should not allow nodejs20.x when not available', async () => {
  // Simulates AL2 build-container
  await expect(
    getSupportedNodeVersion('20.x', true, [14, 16, 18])
  ).rejects.toThrow(
    'Found invalid Node.js Version: "20.x". Please set Node.js Version to 18.x in your Project Settings to use Node.js 18.'
  );
});

it('should not allow nodejs18.x when not available', async () => {
  // Simulates AL2023 build-container
  await expect(getSupportedNodeVersion('18.x', true, [20])).rejects.toThrow(
    'Found invalid Node.js Version: "18.x". Please set Node.js Version to 20.x in your Project Settings to use Node.js 20.'
  );
});

it('should ignore node version in vercel dev getNodeVersion()', async () => {
  expect(
    await getNodeVersion(
      '/tmp',
      undefined,
      { nodeVersion: '1' },
      { isDev: true }
    )
  ).toHaveProperty('runtime', 'nodejs');
});

it('should select project setting from config when no package.json is found and fallback undefined', async () => {
  expect(
    await getNodeVersion('/tmp', undefined, { nodeVersion: '18.x' }, {})
  ).toHaveProperty('range', '18.x');
  expect(warningMessages).toStrictEqual([]);
});

it('should select project setting from config when no package.json is found and fallback is null', async () => {
  expect(
    await getNodeVersion('/tmp', null as any, { nodeVersion: '18.x' }, {})
  ).toHaveProperty('range', '18.x');
  expect(warningMessages).toStrictEqual([]);
});

it('should select project setting from fallback when no package.json is found', async () => {
  expect(await getNodeVersion('/tmp', '18.x')).toHaveProperty('range', '18.x');
  expect(warningMessages).toStrictEqual([]);
});

it('should prefer package.json engines over project setting from config and warn', async () => {
  expect(
    await getNodeVersion(
      path.join(__dirname, 'pkg-engine-node'),
      undefined,
      { nodeVersion: '12.x' },
      {}
    )
  ).toHaveProperty('range', '18.x');
  expect(warningMessages).toStrictEqual([
    'Warning: Due to "engines": { "node": "18.x" } in your `package.json` file, the Node.js Version defined in your Project Settings ("12.x") will not apply, Node.js Version "18.x" will be used instead. Learn More: http://vercel.link/node-version',
  ]);
});

it('should warn when package.json engines is exact version', async () => {
  expect(
    await getNodeVersion(
      path.join(__dirname, 'pkg-engine-node-exact'),
      undefined,
      {},
      {}
    )
  ).toHaveProperty('range', '18.x');
  expect(warningMessages).toStrictEqual([
    'Warning: Detected "engines": { "node": "18.2.0" } in your `package.json` with major.minor.patch, but only major Node.js Version can be selected. Learn More: http://vercel.link/node-version',
  ]);
});

it('should warn when package.json engines is greater than', async () => {
  expect(
    await getNodeVersion(
      path.join(__dirname, 'pkg-engine-node-greaterthan'),
      undefined,
      {},
      {}
    )
  ).toHaveProperty('range', '22.x');
  expect(warningMessages).toStrictEqual([
    'Warning: Detected "engines": { "node": ">=16" } in your `package.json` that will automatically upgrade when a new major Node.js Version is released. Learn More: http://vercel.link/node-version',
  ]);
});

it('should warn when project settings gets overrided', async () => {
  expect(
    await getNodeVersion(
      path.join(__dirname, 'pkg-engine-node-greaterthan'),
      undefined,
      { nodeVersion: '16.x' },
      {}
    )
  ).toHaveProperty('range', '22.x');
  expect(warningMessages).toStrictEqual([
    'Warning: Due to "engines": { "node": ">=16" } in your `package.json` file, the Node.js Version defined in your Project Settings ("16.x") will not apply, Node.js Version "22.x" will be used instead. Learn More: http://vercel.link/node-version',
    'Warning: Detected "engines": { "node": ">=16" } in your `package.json` that will automatically upgrade when a new major Node.js Version is released. Learn More: http://vercel.link/node-version',
  ]);
});

it('should not warn when package.json engines matches project setting from config', async () => {
  expect(
    await getNodeVersion(
      path.join(__dirname, 'pkg-engine-node'),
      undefined,
      { nodeVersion: '18' },
      {}
    )
  ).toHaveProperty('range', '18.x');
  expect(warningMessages).toStrictEqual([]);

  expect(
    await getNodeVersion(
      path.join(__dirname, 'pkg-engine-node'),
      undefined,
      { nodeVersion: '18.x' },
      {}
    )
  ).toHaveProperty('range', '18.x');
  expect(warningMessages).toStrictEqual([]);

  expect(
    await getNodeVersion(
      path.join(__dirname, 'pkg-engine-node'),
      undefined,
      { nodeVersion: '<19' },
      {}
    )
  ).toHaveProperty('range', '18.x');
  expect(warningMessages).toStrictEqual([]);
});

it('should get latest node version', async () => {
  expect(getLatestNodeVersion()).toHaveProperty('major', 22);
});

it('should get latest node version with Node 18.x in build-container', async () => {
  // Simulates AL2 build-container
  expect(getLatestNodeVersion([14, 16, 18])).toHaveProperty('major', 18);
});

it('should get latest node version with Node 22.x in build-container', async () => {
  // Simulates AL2023 build-container
  expect(getLatestNodeVersion([22])).toHaveProperty('major', 22);
});

it('should throw for discontinued versions', async () => {
  // Mock a future date so that Node 16 becomes discontinued
  const realDateNow = Date.now;
  try {
    global.Date.now = () => new Date('2025-03-01').getTime();

    expect(getSupportedNodeVersion('8.10.x', false)).rejects.toThrow();
    expect(getSupportedNodeVersion('8.10.x', true)).rejects.toThrow();
    expect(getSupportedNodeVersion('10.x', false)).rejects.toThrow();
    expect(getSupportedNodeVersion('10.x', true)).rejects.toThrow();
    expect(getSupportedNodeVersion('12.x', false)).rejects.toThrow();
    expect(getSupportedNodeVersion('12.x', true)).rejects.toThrow();
    expect(getSupportedNodeVersion('14.x', false)).rejects.toThrow();
    expect(getSupportedNodeVersion('14.x', true)).rejects.toThrow();
    expect(getSupportedNodeVersion('16.x', false)).rejects.toThrow();
    expect(getSupportedNodeVersion('16.x', true)).rejects.toThrow();

    const discontinued = getDiscontinuedNodeVersions();
    expect(discontinued.length).toBe(5);
    expect(discontinued[0]).toHaveProperty('range', '16.x');
    expect(discontinued[1]).toHaveProperty('range', '14.x');
    expect(discontinued[2]).toHaveProperty('range', '12.x');
    expect(discontinued[3]).toHaveProperty('range', '10.x');
    expect(discontinued[4]).toHaveProperty('range', '8.10.x');
  } finally {
    global.Date.now = realDateNow;
  }
});

it('should only allow nodejs22.x when env var is set', async () => {
  expect(getLatestNodeVersion()).toHaveProperty('major', 22);
  expect(await getSupportedNodeVersion('22.x')).toHaveProperty('major', 22);
  expect(await getSupportedNodeVersion('22')).toHaveProperty('major', 22);
  expect(await getSupportedNodeVersion('22.1.0')).toHaveProperty('major', 22);
  expect(await getSupportedNodeVersion('>=20')).toHaveProperty('major', 22);
});

it('should warn for deprecated versions, soon to be discontinued', async () => {
  // Mock a future date so that Node 16 warns
  const realDateNow = Date.now;
  try {
    global.Date.now = () => new Date('2021-02-23').getTime();

    expect(await getSupportedNodeVersion('16.x', false)).toHaveProperty(
      'major',
      16
    );
    expect(await getSupportedNodeVersion('16.x', true)).toHaveProperty(
      'major',
      16
    );
    expect(warningMessages).toStrictEqual([
      'Error: Node.js version 16.x is deprecated. Deployments created on or after 2025-02-03 will fail to build. Please set "engines": { "node": "22.x" } in your `package.json` file to use Node.js 22.',
      'Error: Node.js version 16.x is deprecated. Deployments created on or after 2025-02-03 will fail to build. Please set Node.js Version to 22.x in your Project Settings to use Node.js 22.',
    ]);
  } finally {
    global.Date.now = realDateNow;
  }
});

it('should support initialHeaders and initialStatus correctly', async () => {
  new Prerender({
    expiration: 1,
    fallback: null,
    group: 1,
    bypassToken: 'some-long-bypass-token-to-make-it-work',
    initialHeaders: {
      'content-type': 'application/json',
      'x-initial': 'true',
    },
    initialStatus: 308,
  });
  new Prerender({
    expiration: 1,
    fallback: null,
    group: 1,
    bypassToken: 'some-long-bypass-token-to-make-it-work',
    initialStatus: 308,
  });
  new Prerender({
    expiration: 1,
    fallback: null,
    group: 1,
    bypassToken: 'some-long-bypass-token-to-make-it-work',
    initialHeaders: {
      'content-type': 'application/json',
      'x-initial': 'true',
    },
  });
});

it('should support experimentalBypassFor correctly', async () => {
  new Prerender({
    expiration: 1,
    fallback: null,
    group: 1,
    bypassToken: 'some-long-bypass-token-to-make-it-work',
    experimentalBypassFor: [{ type: 'header', key: 'Next-Action' }],
  });
  new Prerender({
    expiration: 1,
    fallback: null,
    group: 1,
    bypassToken: 'some-long-bypass-token-to-make-it-work',
    experimentalBypassFor: [
      { type: 'header', key: 'Next-Action' },
      {
        type: 'cookie',
        key: '__prerender_bypass',
        value: 'some-long-bypass-token-to-make-it-work',
      },
    ],
  });
  new Prerender({
    expiration: 1,
    fallback: null,
    group: 1,
    bypassToken: 'some-long-bypass-token-to-make-it-work',
    experimentalBypassFor: [{ type: 'query', key: 'bypass', value: '1' }],
  });
  new Prerender({
    expiration: 1,
    fallback: null,
    group: 1,
    bypassToken: 'some-long-bypass-token-to-make-it-work',
    experimentalBypassFor: [{ type: 'host', value: 'vercel.com' }],
  });

  expect(() => {
    new Prerender({
      expiration: 1,
      fallback: null,
      group: 1,
      bypassToken: 'some-long-bypass-token-to-make-it-work',
      // @ts-expect-error: testing invalid args
      experimentalBypassFor: 'foo',
    });
  }).toThrowError(
    'The `experimentalBypassFor` argument for `Prerender` must be Array of objects with fields `type`, `key` and optionally `value`.'
  );

  expect(() => {
    new Prerender({
      expiration: 1,
      fallback: null,
      group: 1,
      bypassToken: 'some-long-bypass-token-to-make-it-work',
      // @ts-expect-error: testing invalid args
      experimentalBypassFor: [{ type: 'header', value: { foo: 'bar' } }],
    });
  }).toThrowError(
    'The `experimentalBypassFor` argument for `Prerender` must be Array of objects with fields `type`, `key` and optionally `value`.'
  );
});

it('should support passQuery correctly', async () => {
  new Prerender({
    expiration: 1,
    fallback: null,
    group: 1,
    bypassToken: 'some-long-bypass-token-to-make-it-work',
    passQuery: true,
  });
  new Prerender({
    expiration: 1,
    fallback: null,
    group: 1,
    bypassToken: 'some-long-bypass-token-to-make-it-work',
    passQuery: false,
  });
  new Prerender({
    expiration: 1,
    fallback: null,
    group: 1,
    bypassToken: 'some-long-bypass-token-to-make-it-work',
    passQuery: undefined,
  });
  new Prerender({
    expiration: 1,
    fallback: null,
    group: 1,
    bypassToken: 'some-long-bypass-token-to-make-it-work',
  });

  expect(() => {
    new Prerender({
      expiration: 1,
      fallback: null,
      group: 1,
      bypassToken: 'some-long-bypass-token-to-make-it-work',
      // @ts-expect-error testing invalid field
      passQuery: 'true',
    });
  }).toThrowError(
    `The \`passQuery\` argument for \`Prerender\` must be a boolean.`
  );
});

it('should support experimentalStreamingLambdaPath correctly', async () => {
  new Prerender({
    expiration: 1,
    fallback: null,
    group: 1,
    bypassToken: 'some-long-bypass-token-to-make-it-work',
    experimentalStreamingLambdaPath: undefined,
  });
  new Prerender({
    expiration: 1,
    fallback: null,
    group: 1,
    bypassToken: 'some-long-bypass-token-to-make-it-work',
    experimentalStreamingLambdaPath: '/some/path/to/lambda',
  });
  new Prerender({
    expiration: 1,
    fallback: null,
    group: 1,
    bypassToken: 'some-long-bypass-token-to-make-it-work',
  });

  expect(() => {
    new Prerender({
      expiration: 1,
      fallback: null,
      group: 1,
      bypassToken: 'some-long-bypass-token-to-make-it-work',
      // @ts-expect-error testing invalid field
      experimentalStreamingLambdaPath: 1,
    });
  }).toThrowError(
    `The \`experimentalStreamingLambdaPath\` argument for \`Prerender\` must be a string.`
  );
});

it('should support chain correctly', async () => {
  new Prerender({
    expiration: 1,
    fallback: null,
    group: 1,
    bypassToken: 'some-long-bypass-token-to-make-it-work',
    chain: undefined,
  });
  new Prerender({
    expiration: 1,
    fallback: null,
    group: 1,
    bypassToken: 'some-long-bypass-token-to-make-it-work',
    chain: {
      outputPath: '/some/path/to/lambda',
      headers: { 'x-nextjs-data': 'true' },
    },
  });
  new Prerender({
    expiration: 1,
    fallback: null,
    group: 1,
    bypassToken: 'some-long-bypass-token-to-make-it-work',
    chain: {
      outputPath: '/some/path/to/lambda',
      headers: { 'x-nextjs-data': 'true', 'x-nextjs-data-2': 'true' },
    },
  });

  expect(() => {
    new Prerender({
      expiration: 1,
      fallback: null,
      group: 1,
      bypassToken: 'some-long-bypass-token-to-make-it-work',
      // @ts-expect-error testing invalid field
      chain: 'true',
    });
  }).toThrowError('The `chain` argument for `Prerender` must be an object.');
  expect(() => {
    new Prerender({
      expiration: 1,
      fallback: null,
      group: 1,
      bypassToken: 'some-long-bypass-token-to-make-it-work',
      // @ts-expect-error testing invalid field
      chain: { headers: 'true' },
    });
  }).toThrowError(
    'The `chain.headers` argument for `Prerender` must be an object with string key/values'
  );
  expect(() => {
    new Prerender({
      expiration: 1,
      fallback: null,
      group: 1,
      bypassToken: 'some-long-bypass-token-to-make-it-work',
      // @ts-expect-error testing invalid field
      chain: { headers: { 'x-nextjs-data': 1 } },
    });
  }).toThrowError(
    'The `chain.headers` argument for `Prerender` must be an object with string key/values'
  );
  expect(() => {
    new Prerender({
      expiration: 1,
      fallback: null,
      group: 1,
      bypassToken: 'some-long-bypass-token-to-make-it-work',
      // @ts-expect-error testing invalid field
      chain: { headers: {} },
    });
  }).toThrowError(
    'The `chain.outputPath` argument for `Prerender` must be a string.'
  );
});

it('should support require by path for legacy builders', () => {
  const index = require('../');

  const download2 = require('../fs/download.js');
  const getWriteableDirectory2 = require('../fs/get-writable-directory.js');
  const glob2 = require('../fs/glob.js');
  const rename2 = require('../fs/rename.js');
  const {
    runNpmInstall: runNpmInstall2,
  } = require('../fs/run-user-scripts.js');
  const streamToBuffer2 = require('../fs/stream-to-buffer.js');

  const FileBlob2 = require('../file-blob.js');
  const FileFsRef2 = require('../file-fs-ref.js');
  const FileRef2 = require('../file-ref.js');
  const { Lambda: Lambda2 } = require('../lambda.js');

  expect(download2).toBe(index.download);
  expect(getWriteableDirectory2).toBe(index.getWriteableDirectory);
  expect(glob2).toBe(index.glob);
  expect(rename2).toBe(index.rename);
  expect(runNpmInstall2).toBe(index.runNpmInstall);
  expect(streamToBuffer2).toBe(index.streamToBuffer);

  expect(FileBlob2).toBe(index.FileBlob);
  expect(FileFsRef2).toBe(index.FileFsRef);
  expect(FileRef2).toBe(index.FileRef);
  expect(Lambda2).toBe(index.Lambda);
});

it(
  'should have correct $PATH when running `runPackageJsonScript()` with yarn',
  async () => {
    if (process.platform === 'win32') {
      console.log('Skipping test on windows');
      return;
    }
    if (process.platform === 'darwin') {
      console.log('Skipping test on macOS');
      return;
    }
    if (process.version.split('.')[0] !== 'v16') {
      console.log(`Skipping test on Node.js ${process.version}`);
      return;
    }
    const fixture = path.join(__dirname, 'fixtures', '19-yarn-v2');
    await runNpmInstall(fixture);
    await runPackageJsonScript(fixture, 'env');

    // `yarn` was failing with ENOENT before, so as long as the
    // script was invoked at all is enough to verify the fix
    const out = await fs.readFile(path.join(fixture, 'env.txt'), 'utf8');
    expect(out.trim()).toBeTruthy();
  },
  ms('1m')
);

it('should return cliType "npm" when no lockfile is present', async () => {
  const originalRepoLockfilePath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'pnpm-lock.yaml'
  );
  const originalRepoLockfileData = await fs.readFile(originalRepoLockfilePath);
  await fs.remove(originalRepoLockfilePath);
  try {
    const fixture = path.join(__dirname, 'fixtures', '40-no-lockfile');
    const result = await scanParentDirs(fixture);
    expect(result.cliType).toEqual('npm');
    expect(result.lockfileVersion).toEqual(undefined);
    expect(result.lockfilePath).toEqual(undefined);
    expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
  } finally {
    await fs.writeFile(originalRepoLockfilePath, originalRepoLockfileData);
  }
});

it('should return cliType bun and correct lock file for bun v1 with bun.lockb', async () => {
  const fixture = path.join(__dirname, 'fixtures', '30-bun-v1-lockb');
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('bun');
  expect(result.lockfileVersion).toEqual(0);
  expect(result.lockfilePath).toEqual(path.join(fixture, 'bun.lockb'));
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should return cliType bun and correct lock file for bun v1 with yarn.lock file', async () => {
  const fixture = path.join(__dirname, 'fixtures', '31-bun-v1-with-yarn-lock');
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('bun');
  expect(result.lockfileVersion).toEqual(0);
  expect(result.lockfilePath).toEqual(path.join(fixture, 'bun.lockb'));
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should return cliType bun and correct lock file for bun v1 with bun.lock', async () => {
  const fixture = path.join(__dirname, 'fixtures', '32-bun-v1-lock');
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('bun');
  expect(result.lockfileVersion).toEqual(1);
  expect(result.lockfilePath).toEqual(path.join(fixture, 'bun.lock'));
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should return lockfileVersion 2 with npm7', async () => {
  const fixture = path.join(__dirname, 'fixtures', '20-npm-7');
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('npm');
  expect(result.lockfileVersion).toEqual(2);
  expect(result.lockfilePath).toEqual(path.join(fixture, 'package-lock.json'));
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should return lockfileVersion with yarn 2', async () => {
  const fixture = path.join(__dirname, 'fixtures', '19-yarn-v2');
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('yarn');
  expect(result.lockfileVersion).toEqual(4);
  expect(result.lockfilePath).toEqual(path.join(fixture, 'yarn.lock'));
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should return lockfileVersion with yarn 4', async () => {
  const fixture = path.join(__dirname, 'fixtures', '44-yarn-v4');
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('yarn');
  expect(result.lockfileVersion).toEqual(8);
  expect(result.lockfilePath).toEqual(path.join(fixture, 'yarn.lock'));
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should return lockfileVersion with yarn 1', async () => {
  const fixture = path.join(__dirname, 'fixtures', '45-yarn-v1');
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('yarn');
  expect(result.lockfileVersion).toEqual(1);
  expect(result.lockfilePath).toEqual(path.join(fixture, 'yarn.lock'));
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should return lockfileVersion 1 with older versions of npm', async () => {
  const fixture = path.join(__dirname, 'fixtures', '08-yarn-npm/with-npm');
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('npm');
  expect(result.lockfileVersion).toEqual(1);
  expect(result.lockfilePath).toEqual(path.join(fixture, 'package-lock.json'));
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should detect npm Workspaces', async () => {
  const fixture = path.join(__dirname, 'fixtures', '21-npm-workspaces/a');
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('npm');
  expect(result.lockfileVersion).toEqual(2);
  expect(result.lockfilePath).toEqual(
    path.join(fixture, '..', 'package-lock.json')
  );
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should detect pnpm without workspace', async () => {
  const fixture = path.join(__dirname, 'fixtures', '22-pnpm');
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('pnpm');
  expect(result.lockfileVersion).toEqual(5.3);
  expect(result.lockfilePath).toEqual(path.join(fixture, 'pnpm-lock.yaml'));
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should detect pnpm with workspaces', async () => {
  const fixture = path.join(__dirname, 'fixtures', '23-pnpm-workspaces/c');
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('pnpm');
  expect(result.lockfileVersion).toEqual(5.3);
  expect(result.lockfilePath).toEqual(
    path.join(fixture, '..', 'pnpm-lock.yaml')
  );
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should detect package.json in nested backend', async () => {
  const fixture = path.join(
    __dirname,
    '../../node/test/fixtures/18.1-nested-packagejson/backend'
  );
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('pnpm');
  // There is no lockfile but this test will pick up vercel/vercel/pnpm-lock.yaml
  expect(result.lockfileVersion).toEqual(6);
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should detect package.json in nested frontend', async () => {
  const fixture = path.join(
    __dirname,
    '../../node/test/fixtures/18.1-nested-packagejson/frontend'
  );
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('pnpm');
  // There is no lockfile but this test will pick up vercel/vercel/pnpm-lock.yaml
  expect(result.lockfileVersion).toEqual(6);
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should detect turborepo project supporting corepack', async () => {
  const base = path.join(
    __dirname,
    'fixtures',
    '41-turborepo-supporting-corepack-home'
  );
  const fixture = path.join(base, '/apps/web');
  const result = await scanParentDirs(fixture, true, base);
  expect(result.turboSupportsCorepackHome).toEqual(true);
});

it('should handle turborepo project with comments in turbo.json', async () => {
  const base = path.join(
    __dirname,
    'fixtures',
    '43-turborepo-with-comments-in-turbo-json'
  );
  const fixture = path.join(base, '/apps/web');
  const result = await scanParentDirs(fixture, true, base);
  expect(result.turboSupportsCorepackHome).toEqual(true);
});

it('should detect turborepo project not supporting corepack', async () => {
  const base = path.join(
    __dirname,
    'fixtures',
    '42-turborepo-not-supporting-corepack-home'
  );
  const fixture = path.join(base, '/apps/web');
  const result = await scanParentDirs(fixture, true, base);
  expect(result.turboSupportsCorepackHome).toEqual(false);
});

it('should detect non-turborepo monorepo', async () => {
  const base = path.join(__dirname, 'fixtures', '23-pnpm-workspaces');
  const fixture = path.join(base, '/c');
  const result = await scanParentDirs(fixture, true, base);
  expect(result.turboSupportsCorepackHome).toEqual(undefined);
});

it('should detect `packageManager` in npm monorepo', async () => {
  try {
    process.env.ENABLE_EXPERIMENTAL_COREPACK = '1';

    const base = path.join(__dirname, 'fixtures', '41-npm-workspaces-corepack');
    const fixture = path.join(base, 'a');
    const result = await scanParentDirs(fixture, false, base);
    expect(result.cliType).toEqual('npm');
    expect(result.packageJsonPackageManager).toEqual('npm@10.7.0');
    expect(result.lockfileVersion).toEqual(undefined);
    expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
  } finally {
    delete process.env.ENABLE_EXPERIMENTAL_COREPACK;
  }
});

it('should detect `packageManager` in pnpm monorepo', async () => {
  try {
    process.env.ENABLE_EXPERIMENTAL_COREPACK = '1';
    const base = path.join(
      __dirname,
      'fixtures',
      '42-pnpm-workspaces-corepack'
    );
    const fixture = path.join(base, 'c');
    const result = await scanParentDirs(fixture, false, base);
    expect(result.cliType).toEqual('pnpm');
    expect(result.packageJsonPackageManager).toEqual('pnpm@8.3.1');
    expect(result.lockfileVersion).toEqual(undefined);
    expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
  } finally {
    delete process.env.ENABLE_EXPERIMENTAL_COREPACK;
  }
});

it('should retry npm install when peer deps invalid and npm@8 on node@16', async () => {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor !== 16) {
    console.log(`Skipping test on node@${nodeMajor}`);
    return;
  }
  if (process.platform === 'win32') {
    console.log('Skipping test on windows');
    return;
  }
  if (process.platform === 'darwin') {
    console.log('Skipping test on mac');
    return;
  }

  const fixture = path.join(__dirname, 'fixtures', '15-npm-8-legacy-peer-deps');
  const nodeVersion = { major: nodeMajor } as any;
  await runNpmInstall(fixture, [], {}, {}, nodeVersion);
  expect(warningMessages).toStrictEqual([
    'Warning: Retrying "Install Command" with `--legacy-peer-deps` which may accept a potentially broken dependency and slow install time.',
  ]);
});

describe('rename', () => {
  it('should rename keys of files map', () => {
    const before: Files = {};
    const toUpper = (s: string) => s.toUpperCase();

    for (let i = 97; i <= 122; i++) {
      const key = String.fromCharCode(i);
      before[key] = new FileBlob({ contentType: 'text/plain', data: key });
    }

    const after = rename(before, toUpper);
    expect(Object.keys(after)).toEqual('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
  });
});
