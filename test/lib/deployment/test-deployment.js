const assert = require('assert');
const bufferReplace = require('buffer-replace');
const fs = require('fs');
const json5 = require('json5');
const glob = require('util').promisify(require('glob'));
const path = require('path');
const { spawn } = require('child_process');
const fetch = require('./fetch-retry.js');
const { nowDeploy, fileModeSymbol } = require('./now-deploy.js');

async function packAndDeploy(builderPath) {
  await spawnAsync('npm', ['--loglevel', 'warn', 'pack'], {
    stdio: 'inherit',
    cwd: builderPath,
  });
  const tarballs = await glob('*.tgz', { cwd: builderPath });
  const tgzPath = path.join(builderPath, tarballs[0]);
  console.log('tgzPath', tgzPath);
  const url = await nowDeployIndexTgz(tgzPath);
  await fetchTgzUrl(`https://${url}`);
  fs.unlinkSync(tgzPath);
  return url;
}

const RANDOMNESS_PLACEHOLDER_STRING = 'RANDOMNESS_PLACEHOLDER';

async function testDeployment(
  { builderUrl, buildUtilsUrl },
  fixturePath,
  buildDelegate
) {
  console.log('testDeployment', fixturePath);
  const globResult = await glob(`${fixturePath}/**`, {
    nodir: true,
    dot: true,
  });
  const bodies = globResult.reduce((b, f) => {
    const r = path.relative(fixturePath, f);
    b[r] = fs.readFileSync(f);
    b[r][fileModeSymbol] = fs.statSync(f).mode;
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

  const configName = 'vercel.json' in bodies ? 'vercel.json' : 'now.json';

  // we use json5 to allow comments for probes
  const nowJson = json5.parse(bodies[configName]);
  const uploadNowJson = nowJson.uploadNowJson;
  delete nowJson.uploadNowJson;

  if (process.env.VERCEL_BUILDER_DEBUG) {
    if (!nowJson.build) {
      nowJson.build = {};
    }
    if (!nowJson.build.env) {
      nowJson.build.env = {};
    }
    nowJson.build.env.VERCEL_BUILDER_DEBUG = process.env.VERCEL_BUILDER_DEBUG;
  }

  for (const build of nowJson.builds || []) {
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
        const buildUtils = config.useBuildUtils || '@vercel/build-utils';
        config.useBuildUtils = `${buildUtils}@canary`;
      } else {
        config.useBuildUtils = `https://${buildUtilsUrl}`;
      }
    }

    if (buildDelegate) {
      buildDelegate(build);
    }
  }

  bodies[configName] = Buffer.from(JSON.stringify(nowJson));
  delete bodies['probe.js'];

  const { deploymentId, deploymentUrl } = await nowDeploy(
    bodies,
    randomness,
    uploadNowJson
  );
  let nextBuildManifest;
  let deploymentLogs;

  for (const probe of nowJson.probes || []) {
    console.log('testing', JSON.stringify(probe));
    if (probe.delay) {
      await new Promise(resolve => setTimeout(resolve, probe.delay));
      continue;
    }

    if (probe.logMustContain || probe.logMustNotContain) {
      const shouldContain = !!probe.logMustContain;
      const toCheck = probe.logMustContain || probe.logMustNotContain;

      if (probe.logMustContain && probe.logMustNotContain) {
        throw new Error(
          `probe can not check logMustContain and logMustNotContain in the same check`
        );
      }

      if (!deploymentLogs) {
        try {
          const logsRes = await fetch(
            `https://vercel.com/api/v1/now/deployments/${deploymentId}/events?limit=-1`
          );

          if (!logsRes.ok) {
            throw new Error(
              `fetching logs failed with status ${logsRes.status}`
            );
          }
          deploymentLogs = await logsRes.json();
        } catch (err) {
          throw new Error(
            `Failed to get deployment logs for probe: ${err.message}`
          );
        }
      }

      let found = false;

      for (const log of deploymentLogs) {
        if (log.text && log.text.includes(toCheck)) {
          if (shouldContain) {
            found = true;
            break;
          } else {
            throw new Error(
              `Expected deployment logs not to contain ${toCheck}, but found ${log.text}`
            );
          }
        }
      }

      if (!found && shouldContain) {
        throw new Error(
          `Expected deployment logs to contain ${toCheck}, it was not found`
        );
      } else {
        console.log('finished testing', JSON.stringify(probe));
        continue;
      }
    }

    const nextScriptIndex = probe.path.indexOf('__NEXT_SCRIPT__(');

    if (nextScriptIndex > -1) {
      const scriptNameEnd = probe.path.lastIndexOf(')');
      let scriptName = probe.path.substring(
        nextScriptIndex + '__NEXT_SCRIPT__('.length,
        scriptNameEnd
      );
      const scriptArgs = scriptName.split(',');

      scriptName = scriptArgs.shift();
      const manifestPrefix = scriptArgs.shift() || '';

      if (!nextBuildManifest) {
        const manifestUrl = `https://${deploymentUrl}${manifestPrefix}/_next/static/testing-build-id/_buildManifest.js`;

        console.log('fetching buildManifest at', manifestUrl);
        const { text: manifestContent } = await fetchDeploymentUrl(manifestUrl);

        // we must eval it since we use devalue to stringify it
        global.__BUILD_MANIFEST_CB = null;
        nextBuildManifest = eval(
          manifestContent
            .replace('self.__BUILD_MANIFEST', 'manifest')
            .replace(/self.__BUILD_MANIFEST_CB.*/, '')
        );
      }
      const scriptRelativePath = nextBuildManifest[scriptName];

      probe.path =
        probe.path.substring(0, nextScriptIndex) +
        scriptRelativePath +
        probe.path.substr(scriptNameEnd + 1);
    }

    const probeUrl = `https://${deploymentUrl}${probe.path}`;
    const fetchOpts = {
      ...probe.fetchOptions,
      method: probe.method,
      headers: { ...probe.headers },
    };
    if (probe.body) {
      fetchOpts.headers['content-type'] = 'application/json';
      fetchOpts.body = JSON.stringify(probe.body);
    }
    const { text, resp } = await fetchDeploymentUrl(probeUrl, fetchOpts);
    console.log('finished testing', JSON.stringify(probe));

    if (probe.status) {
      if (probe.status !== resp.status) {
        throw new Error(
          `Fetched page ${probeUrl} does not return the status ${probe.status} Instead it has ${resp.status}`
        );
      }
    }

    if (probe.mustContain || probe.mustNotContain) {
      const shouldContain = !!probe.mustContain;
      const containsIt = text.includes(probe.mustContain);
      if (
        (!containsIt && probe.mustContain) ||
        (containsIt && probe.mustNotContain)
      ) {
        fs.writeFileSync(path.join(__dirname, 'failed-page.txt'), text);
        const headers = Array.from(resp.headers.entries())
          .map(([k, v]) => `  ${k}=${v}`)
          .join('\n');
        throw new Error(
          `Fetched page ${probeUrl} does${
            shouldContain ? ' not' : ''
          } contain ${
            shouldContain ? probe.mustContain : probe.mustNotContain
          }.` +
            (shouldContain ? ` Instead it contains ${text.slice(0, 60)}` : '') +
            ` Response headers:\n ${headers}`
        );
      }
    } else if (probe.responseHeaders) {
      // eslint-disable-next-line no-loop-func
      Object.keys(probe.responseHeaders).forEach(header => {
        const actual = resp.headers.get(header);
        const expected = probe.responseHeaders[header];
        const isEqual = Array.isArray(expected)
          ? expected.every(h => actual.includes(h))
          : typeof expected === 'string' &&
            expected.startsWith('/') &&
            expected.endsWith('/')
          ? new RegExp(expected.slice(1, -1)).test(actual)
          : expected === actual;
        if (!isEqual) {
          const headers = Array.from(resp.headers.entries())
            .map(([k, v]) => `  ${k}=${v}`)
            .join('\n');

          throw new Error(
            `Page ${probeUrl} does not have header ${header}.\n\nExpected: ${expected}.\nActual: ${headers}`
          );
        }
      });
    } else if (probe.notResponseHeaders) {
      Object.keys(probe.notResponseHeaders).forEach(header => {
        const headerValue = resp.headers.get(header);
        const expected = probe.notResponseHeaders[header];

        if (headerValue === expected) {
          const headers = Array.from(resp.headers.entries())
            .map(([k, v]) => `  ${k}=${v}`)
            .join('\n');

          throw new Error(
            `Page ${probeUrl} invalid page header ${header}.\n\n Did not expect: ${header}=${expected}.\nBut got ${headers}`
          );
        }
      });
    } else if (!probe.status) {
      assert(false, 'probe must have a test condition');
    }
  }

  const probeJsFullPath = path.resolve(fixturePath, 'probe.js');
  if (fs.existsSync(probeJsFullPath)) {
    await require(probeJsFullPath)({ deploymentUrl, fetch, randomness });
  }

  return { deploymentId, deploymentUrl };
}

async function nowDeployIndexTgz(file) {
  const bodies = {
    'index.tgz': fs.readFileSync(file),
    'now.json': Buffer.from(JSON.stringify({ version: 2 })),
  };

  return (await nowDeploy(bodies)).deploymentUrl;
}

async function fetchDeploymentUrl(url, opts) {
  for (let i = 0; i < 50; i += 1) {
    const resp = await fetch(url, opts);
    const text = await resp.text();
    if (text && !text.includes('Join Free')) {
      return { resp, text };
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  throw new Error(`Failed to wait for deployment READY. Url is ${url}`);
}

async function fetchTgzUrl(url) {
  for (let i = 0; i < 500; i += 1) {
    const resp = await fetch(url);
    if (resp.status === 200) {
      const buffer = await resp.buffer();
      if (buffer[0] === 0x1f) {
        // tgz beginning
        return;
      }
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  throw new Error(`Failed to wait for builder url READY. Url is ${url}`);
}

async function spawnAsync(...args) {
  return await new Promise((resolve, reject) => {
    const child = spawn(...args);
    let result;
    if (child.stdout) {
      result = '';
      child.stdout.on('data', chunk => {
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
  testDeployment,
};
