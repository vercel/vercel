const assert = require('assert');
const bufferReplace = require('buffer-replace');
const fs = require('fs-extra');
const glob = require('util').promisify(require('glob'));
const path = require('path');
const { spawn } = require('child_process');
const fetch = require('./fetch-retry.js');
const { nowDeploy } = require('./now-deploy.js');

async function packAndDeploy (builderPath) {
  await spawnAsync('npm', [ '--loglevel', 'warn', 'pack' ], {
    stdio: 'inherit',
    cwd: builderPath
  });
  const tarballs = await glob('*.tgz', { cwd: builderPath });
  const tgzPath = path.join(builderPath, tarballs[0]);
  console.log('tgzPath', tgzPath);
  const url = await nowDeployIndexTgz(tgzPath);
  await fetchTgzUrl(`https://${url}`);
  await fs.unlink(tgzPath);
  return url;
}

const RANDOMNESS_PLACEHOLDER_STRING = 'RANDOMNESS_PLACEHOLDER';

async function testDeployment (
  { builderUrl, buildUtilsUrl },
  fixturePath,
  buildDelegate
) {
  console.log('testDeployment', fixturePath);
  const globResult = await glob(`${fixturePath}/**`, { nodir: true });
  const bodies = globResult.reduce((b, f) => {
    const r = path.relative(fixturePath, f);
    b[r] = fs.readFileSync(f);
    return b;
  }, {});

  const randomness = Math.floor(Math.random() * 0x7fffffff)
    .toString(16)
    .repeat(6)
    .slice(0, RANDOMNESS_PLACEHOLDER_STRING.length);

  for (const file of Object.keys(bodies)) {
    bodies[file] = bufferReplace(
      bodies[file],
      RANDOMNESS_PLACEHOLDER_STRING,
      randomness
    );
  }

  const nowJson = JSON.parse(bodies['now.json']);
  for (const build of nowJson.builds) {
    if (builderUrl) {
      if (builderUrl === '@canary') {
        build.use = `${build.use}@canary`;
      } else {
        build.use = `https://${builderUrl}`;
      }
    }
    if (buildUtilsUrl) {
      build.config = build.config || {};
      const { config } = build;
      if (buildUtilsUrl === '@canary') {
        config.useBuildUtils = config.useBuildUtils || '@now/build-utils';
        config.useBuildUtils = `${config.useBuildUtils}@canary`;
      } else {
        config.useBuildUtils = `https://${buildUtilsUrl}`;
      }
    }

    if (buildDelegate) {
      buildDelegate(build);
    }
  }

  bodies['now.json'] = Buffer.from(JSON.stringify(nowJson));
  delete bodies['probe.js'];
  const { deploymentId, deploymentUrl } = await nowDeploy(bodies, randomness);
  console.log('deploymentUrl', `https://${deploymentUrl}`);

  for (const probe of nowJson.probes || []) {
    console.log('testing', JSON.stringify(probe));
    const probeUrl = `https://${deploymentUrl}${probe.path}`;
    const { text, resp } = await fetchDeploymentUrl(probeUrl, {
      method: probe.method,
      body: probe.body ? JSON.stringify(probe.body) : undefined,
      headers: {
        'content-type': 'application/json'
      }
    });
    if (probe.mustContain) {
      if (!text.includes(probe.mustContain)) {
        await fs.writeFile(path.join(__dirname, 'failed-page.txt'), text);
        const headers = Array.from(resp.headers.entries())
          .map(([ k, v ]) => `  ${k}=${v}`)
          .join('\n');
        throw new Error(
          `Fetched page ${probeUrl} does not contain ${probe.mustContain}.`
            + ` Instead it contains ${text.slice(0, 60)}`
            + ` Response headers:\n ${headers}`
        );
      }
    } else {
      assert(false, 'probe must have a test condition');
    }
  }

  const probeJsFullPath = path.resolve(fixturePath, 'probe.js');
  if (await fs.exists(probeJsFullPath)) {
    await require(probeJsFullPath)({ deploymentUrl, fetch, randomness });
  }

  return { deploymentId, deploymentUrl };
}

async function nowDeployIndexTgz (file) {
  const bodies = {
    'index.tgz': await fs.readFile(file),
    'now.json': Buffer.from(JSON.stringify({ version: 2 }))
  };

  return (await nowDeploy(bodies)).deploymentUrl;
}

async function fetchDeploymentUrl (url, opts) {
  for (let i = 0; i < 500; i += 1) {
    const resp = await fetch(url, opts);
    const text = await resp.text();
    if (
      text
      && !text.includes('Join Free')
      && !text.includes('The page could not be found')
    ) {
      return { resp, text };
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error(`Failed to wait for deployment READY. Url is ${url}`);
}

async function fetchTgzUrl (url) {
  for (let i = 0; i < 500; i += 1) {
    const resp = await fetch(url);
    if (resp.status === 200) {
      const buffer = await resp.buffer();
      if (buffer[0] === 0x1f) {
        // tgz beginning
        return;
      }
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error(`Failed to wait for builder url READY. Url is ${url}`);
}

async function spawnAsync (...args) {
  return await new Promise((resolve, reject) => {
    const child = spawn(...args);
    let result;
    if (child.stdout) {
      result = '';
      child.stdout.on('data', (chunk) => {
        result += chunk.toString();
      });
    }

    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code !== 0) {
        if (result) console.log(result);
        reject(new Error(`Exited with ${code || signal}`));
        return;
      }
      resolve(result);
    });
  });
}

module.exports = {
  packAndDeploy,
  testDeployment
};
