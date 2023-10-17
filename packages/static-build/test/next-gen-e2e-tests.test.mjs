import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import child_process from 'node:child_process';
import url from 'node:url';
import os from 'node:os';

import { expect, test, describe } from 'vitest';
import JSON5 from 'json5';

process.env.RANDOMNESS_BUILD_ENV_VAR = 'RANDOMNESS_PLACEHOLDER';

const testsThatFailToBuild = new Map([
  [
    '04-wrong-dist-dir',
    'No Output Directory named "out" found after the Build completed. You can configure the Output Directory in your Project Settings.',
  ],
  ['05-empty-dist-dir', 'The Output Directory "dist" is empty.'],
  [
    '06-missing-script',
    'Missing required "vercel-build" script in "package.json"',
  ],
  ['07-nonzero-sh', 'Command "./build.sh" exited with 1'],
  [
    '22-docusaurus-2-build-fail',
    'No Output Directory named "build" found after the Build completed. You can configure the Output Directory in your Project Settings.',
  ],
  [
    '36-hugo-version-not-found',
    'Version 0.0.0 of Hugo does not exist. Please specify a different one.',
  ],
]);

async function readBuildEnv (p) {
  const data = await fs.promises.readFile(p, 'utf-8');
  const json = JSON5.parse(data);
  if ('build' in json && 'env' in json.build) {
    return json.build.env;
  } else {
    throw new Error('Does not contain build.env');
  }
}

async function readProbes (p) {
  const data = await fs.promises.readFile(p, 'utf-8');
  const json = JSON5.parse(data);
  if ('probes' in json) {
    return json.probes;
  } else {
    throw new Error('Does not contain probes');
  }
}

async function readProbePath (fixturePath, probePath) {
  const outputPath = path.join(fixturePath, '.vercel/output/static')
  let p = path.join(outputPath, probePath)
  try {
    const fileContents = await fs.promises.readFile(p, 'utf-8');
    return fileContents;
  } catch (err) {
    try {
      // probe path is not a file directly
      const probeDir = await fs.promises.readdir(p);
      // its a directory, scan for index
      const possibleIndexes = probeDir.filter(p => p.startsWith('index')); // could be index.html, index.txt, index.js, index.css
      // preference index.html; otherwise grab the first from the filter
      const indexFile = possibleIndexes.find((p) => p === 'index.html') ?? possibleIndexes[0];
      return fs.promises.readFile(path.join(p, indexFile), 'utf-8');
    } catch (err) {
      return null
    }
  }
}

async function assertProbes (fixturePath) {
  const paths = [ 'now.json', 'vercel.json', 'probes.json' ];
  const probes = await Promise.any(paths.map(p => readProbes(path.join(fixturePath, p)))).catch(() => []);

  for (const probe of probes) {
    let probeContents = await readProbePath(fixturePath, probe.path);
    if ('mustContain' in probe) {
      expect(probeContents).to.contain(probe.mustContain);
    } else {
      throw new Error(`not handling ${JSON.stringify(probe)}`)
    }
  }
}

const exec = util.promisify(child_process.exec);

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

describe('Assert builds', () => {
  const fixtures = path.resolve(__dirname, 'fixtures');
  expect(fs.existsSync(fixtures), 'fixtures path exists');

  const cli = path.resolve(__dirname, '../../cli/scripts/start.js');
  expect(fs.existsSync(cli), 'cli path exists');

  for(const fixture of fs.readdirSync(fixtures).slice(42, 46)) {
    test.concurrent(`Fixture: ${fixture}`, async () => {
      const fixturePath = path.join(fixtures, fixture);
      expect(fs.existsSync(fixturePath), 'fixture path exists').toBe(true);
      const tmpdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), fixture));
      await fs.promises.cp(fixturePath, tmpdir, { recursive: true });
      try {
        const paths = [ 'now.json', 'vercel.json', 'probes.json' ];
        const buildEnv = await Promise.any(paths.map(p => readBuildEnv(path.join(fixturePath, p)))).catch(() => null);
        const { stderr } = await exec(`${cli} build --yes --debug`, { cwd: tmpdir, env: { ...process.env, TZ: 'UTC', ...buildEnv } });
        expect(stderr).to.contain('Build Completed in .vercel/output');
        await assertProbes(tmpdir);
      } catch (err) {
        if (testsThatFailToBuild.has(fixture)) {
          const errMsg = testsThatFailToBuild.get(fixture);
          expect(err.stderr).to.contain(errMsg);
        } else {
          throw err;
        }
      }
    }, 100000);
  }
})
