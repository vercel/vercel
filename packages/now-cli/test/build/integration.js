import test from 'ava';
import path from 'path';
import fs from 'fs-extra';
import execa from 'execa';

const binaryPath = path.resolve(__dirname, `../../scripts/start.js`);
const getFixtureDir = name => path.join(__dirname, 'fixtures', name);
const getBuildDir = (fixtureName, buildName) =>
  path.join(__dirname, 'fixtures', fixtureName, '.now/builds', buildName)

async function buildFixture(fixtureName, opts = {}, args = [], cleanDir) {
  const fixtureDir = getFixtureDir(fixtureName);

  if (cleanDir) {
    fs.remove(path.join(fixtureDir, '.now'));
  }
  return execa(binaryPath, ['build', ...args], {
    cwd: fixtureDir,
    reject: false,
    ...opts
  });
}

const getNestedVal = (obj, keys = '') => {
  let curVal = obj

  for (const key of keys.split('!!')) {
    curVal = curVal && typeof curVal === 'object' && curVal[key]
  }
  return curVal
}

// checks for expected values in the output ignoring differences since
// build output might not always be deterministic so we don't want to
// just do a deepEqual
async function hasBuildOutput(fixtureName, buildName, expectedOutput = {}) {
  const output = await fs.readJson(
    path.join(getBuildDir(fixtureName, buildName), 'output.json')
  );
  let fail = false;

  for (const key of Object.keys(expectedOutput)) {
    const expectedVal = expectedOutput[key];
    const actualVal = getNestedVal(output, key);

    if (expectedVal !== actualVal) {
      fail = true
      console.error(
        `Expected: ${expectedVal} Actual: ${actualVal} for Key: ${key}`
      );
    }
  }

  if (fail) {
    throw new Error(`Received unexpected value for ${fixtureName} ${buildName}`)
  }
}

async function hasBuildFiles(fixtureName, buildName, expectedFiles = []) {
  const buildDir = getBuildDir(fixtureName, buildName);
  let fail = false;

  for (const file of expectedFiles) {
    const filePath = path.join(buildDir, file)
    try {
      const info = await fs.stat(filePath)
      if (!info.isFile) {
        const type = info.isDirectory ? 'directory' : 'symlink'
        console.error(`Expected ${file} to be file but got ${type}`)
        fail = true
      } else if (info.size === 0) {
        console.error(
          `Expected ${file} to not be empty but got size ${info.size}`
        )
        fail = true
      }
    } catch (err) {
      console.error(`Failed to find ${file}`, err)
      fail = true
    }
  }

  if (fail) {
    throw new Error(
      `Did not meet all expected files ${fixtureName} ${buildName}`
    )
  }
}

test('[now-build] 00-now-next', async t => {
  const fixtureName = '00-now-next';
  await buildFixture(fixtureName);
  const buildName = 'package.json-@now_next'

  await t.notThrowsAsync(hasBuildFiles(fixtureName, buildName, [
    'another',
    'index.html',
    'nested/another',
    'nested/index',
    'nested/static.html'
  ]))

  await t.notThrowsAsync(hasBuildOutput(fixtureName, buildName, {
    'output!!another!!type': 'Lambda',
    'output!!another!!zipBuffer': 'OMITTED',
    'output!!another!!handler': 'now__launcher.launcher',

    'output!!nested!!type': 'Lambda',
    'output!!nested!!zipBuffer': 'OMITTED',
    'output!!nested!!handler': 'now__launcher.launcher',

    'output!!nested/another!!type': 'Lambda',
    'output!!nested/another!!zipBuffer': 'OMITTED',
    'output!!nested/another!!handler': 'now__launcher.launcher',

    'output!!nested/static.html!!type': 'FileFsRef',
    'output!!index.html!!type': 'FileFsRef',
  }))
});

test('[now-build] 01-now-next-zero-config', async t => {
  const fixtureName = '01-now-next-zero-config';
  await buildFixture(fixtureName);
  const buildName = 'package.json-@now_next'

  await t.notThrowsAsync(hasBuildFiles(fixtureName, buildName, [
    'another',
    'index.html',
    'nested/another',
    'nested/index',
    'nested/static.html'
  ]))

  await t.notThrowsAsync(hasBuildOutput(fixtureName, buildName, {
    'output!!another!!type': 'Lambda',
    'output!!another!!zipBuffer': 'OMITTED',
    'output!!another!!handler': 'now__launcher.launcher',

    'output!!nested!!type': 'Lambda',
    'output!!nested!!zipBuffer': 'OMITTED',
    'output!!nested!!handler': 'now__launcher.launcher',

    'output!!nested/another!!type': 'Lambda',
    'output!!nested/another!!zipBuffer': 'OMITTED',
    'output!!nested/another!!handler': 'now__launcher.launcher',

    'output!!nested/static.html!!type': 'FileFsRef',
    'output!!index.html!!type': 'FileFsRef',
  }))
});

test('[now-build] 02-api-and-next', async t => {
  const fixtureName = '02-api-and-next';
  await buildFixture(fixtureName);

  let buildName = 'package.json-@now_next'
  await t.notThrowsAsync(hasBuildFiles(fixtureName, buildName, [
    'another',
    'index.html',
    'nested/another',
    'nested/index',
    'nested/static.html'
  ]))

  await t.notThrowsAsync(hasBuildOutput(fixtureName, buildName, {
    'output!!another!!type': 'Lambda',
    'output!!another!!zipBuffer': 'OMITTED',
    'output!!another!!handler': 'now__launcher.launcher',

    'output!!nested!!type': 'Lambda',
    'output!!nested!!zipBuffer': 'OMITTED',
    'output!!nested!!handler': 'now__launcher.launcher',

    'output!!nested/another!!type': 'Lambda',
    'output!!nested/another!!zipBuffer': 'OMITTED',
    'output!!nested/another!!handler': 'now__launcher.launcher',

    'output!!nested/static.html!!type': 'FileFsRef',
    'output!!index.html!!type': 'FileFsRef',
  }))

  buildName = 'api_login.js-@now_node'
  await t.notThrowsAsync(hasBuildFiles(fixtureName, buildName, [
    'api/login.js'
  ]))

  await t.notThrowsAsync(hasBuildOutput(fixtureName, buildName, {
    'output!!type': 'Lambda',
    'output!!zipBuffer': 'OMITTED',
    'output!!handler': '___now_launcher.launcher',
  }))

  buildName = 'api_nested_another.js-@now_node'
  await t.notThrowsAsync(hasBuildFiles(fixtureName, buildName, [
    'api/nested/another.js'
  ]))

  await t.notThrowsAsync(hasBuildOutput(fixtureName, buildName, {
    'output!!type': 'Lambda',
    'output!!zipBuffer': 'OMITTED',
    'output!!handler': '___now_launcher.launcher',
  }))

  buildName = 'api_nested_index.js-@now_node'
  await t.notThrowsAsync(hasBuildFiles(fixtureName, buildName, [
    'api/nested/index.js'
  ]))

  await t.notThrowsAsync(hasBuildOutput(fixtureName, buildName, {
    'output!!type': 'Lambda',
    'output!!zipBuffer': 'OMITTED',
    'output!!handler': '___now_launcher.launcher',
  }))
});

test('[now-build] 03-api-and-next-zero-config', async t => {
  const fixtureName = '03-api-and-next-zero-config';
  await buildFixture(fixtureName);

  let buildName = 'package.json-@now_next'
  await t.notThrowsAsync(hasBuildFiles(fixtureName, buildName, [
    'another',
    'index.html',
    'nested/another',
    'nested/index',
    'nested/static.html'
  ]))

  await t.notThrowsAsync(hasBuildOutput(fixtureName, buildName, {
    'output!!another!!type': 'Lambda',
    'output!!another!!zipBuffer': 'OMITTED',
    'output!!another!!handler': 'now__launcher.launcher',

    'output!!nested!!type': 'Lambda',
    'output!!nested!!zipBuffer': 'OMITTED',
    'output!!nested!!handler': 'now__launcher.launcher',

    'output!!nested/another!!type': 'Lambda',
    'output!!nested/another!!zipBuffer': 'OMITTED',
    'output!!nested/another!!handler': 'now__launcher.launcher',

    'output!!nested/static.html!!type': 'FileFsRef',
    'output!!index.html!!type': 'FileFsRef',
  }))

  buildName = 'api_login.js-@now_node'
  await t.notThrowsAsync(hasBuildFiles(fixtureName, buildName, [
    'api/login.js'
  ]))

  await t.notThrowsAsync(hasBuildOutput(fixtureName, buildName, {
    'output!!type': 'Lambda',
    'output!!zipBuffer': 'OMITTED',
    'output!!handler': '___now_launcher.launcher',
  }))

  buildName = 'api_nested_another.js-@now_node'
  await t.notThrowsAsync(hasBuildFiles(fixtureName, buildName, [
    'api/nested/another.js'
  ]))

  await t.notThrowsAsync(hasBuildOutput(fixtureName, buildName, {
    'output!!type': 'Lambda',
    'output!!zipBuffer': 'OMITTED',
    'output!!handler': '___now_launcher.launcher',
  }))

  buildName = 'api_nested_index.js-@now_node'
  await t.notThrowsAsync(hasBuildFiles(fixtureName, buildName, [
    'api/nested/index.js'
  ]))

  await t.notThrowsAsync(hasBuildOutput(fixtureName, buildName, {
    'output!!type': 'Lambda',
    'output!!zipBuffer': 'OMITTED',
    'output!!handler': '___now_launcher.launcher',
  }))
});

test('[now-build] 04-now-static', async t => {
  const fixtureName = '04-now-static';
  await buildFixture(fixtureName);
  const builds = [
    {
      name: 'meta_1.json',
      files: ['meta/1.json'],
      output: {
        'output!!meta/1.json!!type': 'FileFsRef'
      }
    },
    {
      name: 'meta_another_2.json',
      files: ['meta/another/2.json'],
      output: {
        'output!!meta/another/2.json!!type': 'FileFsRef'
      }
    },
    {
      name: 'posts_1.json',
      files: ['posts/1.json'],
      output: {
        'output!!posts/1.json!!type': 'FileFsRef'
      }
    },
    {
      name: 'posts_another_2.md',
      files: ['posts/another/2.md'],
      output: {
        'output!!posts/another/2.md!!type': 'FileFsRef'
      }
    },
  ]
  for (const build of builds) {
    const buildName = `${build.name}-@now_static`

    await t.notThrowsAsync(hasBuildFiles(fixtureName, buildName, build.files))
    await t.notThrowsAsync(hasBuildOutput(fixtureName, buildName, build.output))
  }
});