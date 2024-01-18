const assert = require('assert');
const bufferReplace = require('buffer-replace');
const fs = require('fs');
const json5 = require('json5');
const { glob } = require('glob');
const path = require('path');
const { spawn } = require('child_process');
const fetch = require('./fetch-retry.js');
const { nowDeploy, fileModeSymbol, fetchWithAuth } = require('./now-deploy.js');
const { logWithinTest } = require('./log');

async function packAndDeploy(builderPath, shouldUnlink = true) {
  await spawnAsync('npm', ['--loglevel', 'warn', 'pack'], {
    stdio: 'inherit',
    cwd: builderPath,
  });
  const tarballs = await glob('*.tgz', { cwd: builderPath });
  const tgzPath = path.join(builderPath, tarballs[0]);
  logWithinTest('tgzPath', tgzPath);
  const url = await nowDeployIndexTgz(tgzPath);
  await fetchTgzUrl(`https://${url}`);
  logWithinTest('finished calling the tgz');
  if (shouldUnlink) {
    fs.unlinkSync(tgzPath);
    logWithinTest('finished unlinking tgz');
  } else {
    logWithinTest('leaving tgz in place');
  }
  return url;
}

const RANDOMNESS_PLACEHOLDER_STRING = 'RANDOMNESS_PLACEHOLDER';

async function runProbe(probe, deploymentId, deploymentUrl, ctx) {
  if (probe.delay) {
    await new Promise(resolve => setTimeout(resolve, probe.delay));
    return;
  }

  if (probe.logMustContain || probe.logMustNotContain) {
    const shouldContain = !!probe.logMustContain;
    const toCheck = probe.logMustContain || probe.logMustNotContain;

    if (probe.logMustContain && probe.logMustNotContain) {
      throw new Error(
        `probe can not check logMustContain and logMustNotContain in the same check`
      );
    }

    if (!ctx.deploymentLogs) {
      let lastErr;

      for (let i = 0; i < 5; i++) {
        try {
          const logsRes = await fetchWithAuth(
            `/v1/now/deployments/${deploymentId}/events?limit=-1`
          );

          if (!logsRes.ok) {
            throw new Error(
              `fetching logs failed with status ${logsRes.status}`
            );
          }
          ctx.deploymentLogs = await logsRes.json();

          if (
            Array.isArray(ctx.deploymentLogs) &&
            ctx.deploymentLogs.length > 2
          ) {
            break;
          }
        } catch (err) {
          lastErr = err;
        }
        ctx.deploymentLogs = null;
        logWithinTest(
          'Retrying to fetch logs for',
          deploymentId,
          'in 2 seconds. Read lines:',
          Array.isArray(ctx.deploymentLogs)
            ? ctx.deploymentLogs.length
            : typeof ctx.deploymentLogs
        );
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (
        !Array.isArray(ctx.deploymentLogs) ||
        ctx.deploymentLogs.length === 0
      ) {
        throw new Error(
          `Failed to get deployment logs for probe: ${
            lastErr ? lastErr.message : 'received empty logs'
          }`
        );
      }
    }

    let found = false;
    const deploymentLogs = ctx.deploymentLogs;

    for (const log of deploymentLogs) {
      if (log.text && log.text.includes(toCheck)) {
        if (shouldContain) {
          found = true;
          break;
        } else {
          throw new Error(
            `Expected deployment logs of ${deploymentId} not to contain ${toCheck}, but found ${log.text}`
          );
        }
      }
    }

    if (!found && shouldContain) {
      logWithinTest({
        deploymentId,
        deploymentUrl,
        deploymentLogs,
        logLength: deploymentLogs?.length,
      });
      throw new Error(
        `Expected deployment logs of ${deploymentId} to contain ${toCheck}, it was not found`
      );
    } else {
      logWithinTest('finished testing', JSON.stringify(probe));
      return;
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

    if (!ctx.nextBuildManifest) {
      const manifestUrl = `https://${deploymentUrl}${manifestPrefix}/_next/static/testing-build-id/_buildManifest.js`;

      logWithinTest('fetching buildManifest at', manifestUrl);
      const { text: manifestContent } = await fetchDeploymentUrl(manifestUrl);

      // we must eval it since we use devalue to stringify it
      global.__BUILD_MANIFEST_CB = null;
      ctx.nextBuildManifest = eval(
        `var self = {};` + manifestContent + `;self.__BUILD_MANIFEST`
      );
    }
    let scriptRelativePath = ctx.nextBuildManifest[scriptName];

    if (Array.isArray(scriptRelativePath)) {
      scriptRelativePath = scriptRelativePath[0];
    }

    probe.path =
      probe.path.substring(0, nextScriptIndex) +
      scriptRelativePath +
      probe.path.substring(scriptNameEnd + 1);
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
  logWithinTest('finished testing', JSON.stringify(probe));

  let hadTest = false;

  if (probe.status) {
    if (probe.status !== resp.status) {
      throw new Error(
        `Fetched page ${probeUrl} does not return the status ${probe.status} Instead it has ${resp.status}`
      );
    }
    hadTest = true;
  }

  if (probe.mustContain) {
    const containsIt = text.includes(probe.mustContain);
    if (!containsIt) {
      fs.writeFileSync(path.join(__dirname, 'failed-page.txt'), text);
      const headers = Array.from(resp.headers.entries())
        .map(([k, v]) => `  ${k}=${v}`)
        .join('\n');
      throw new Error(
        `Fetched page ${probeUrl} does not contain ${probe.mustContain}.` +
          ` Content ${text}` +
          ` Response headers:\n ${headers}`
      );
    }
    hadTest = true;
  }

  if (probe.mustNotContain) {
    const containsIt = text.includes(probe.mustNotContain);
    if (containsIt) {
      fs.writeFileSync(path.join(__dirname, 'failed-page.txt'), text);
      const headers = Array.from(resp.headers.entries())
        .map(([k, v]) => `  ${k}=${v}`)
        .join('\n');
      throw new Error(
        `Fetched page ${probeUrl} does contain ${probe.mustNotContain}.` +
          ` Content ${text}` +
          ` Response headers:\n ${headers}`
      );
    }
    hadTest = true;
  }

  if (probe.bodyMustBe) {
    if (text !== probe.bodyMustBe) {
      throw new Error(
        `Fetched page ${probeUrl} does not have an exact body match of ${probe.bodyMustBe}. Content: ${text}`
      );
    }

    hadTest = true;
  }

  /**
   * @type Record<string, string[]>
   */
  const rawHeaders = resp.headers.raw();
  if (probe.responseHeaders) {
    // eslint-disable-next-line no-loop-func
    Object.keys(probe.responseHeaders).forEach(header => {
      const actualArr = rawHeaders[header.toLowerCase()];
      let expectedArr = probe.responseHeaders[header];

      // Header should not exist
      if (expectedArr === null) {
        if (actualArr) {
          throw new Error(
            `Page ${probeUrl} contains response header "${header}", but probe says it should not.\n\nActual: ${formatHeaders(
              rawHeaders
            )}`
          );
        }
        return;
      }

      if (!actualArr?.length) {
        throw new Error(
          `Page ${probeUrl} does NOT contain response header "${header}", but probe says it should .\n\nActual: ${formatHeaders(
            rawHeaders
          )}`
        );
      }

      if (!Array.isArray(expectedArr)) {
        expectedArr = [expectedArr];
      }
      for (const expected of expectedArr) {
        let isEqual = false;

        for (const actual of actualArr) {
          isEqual =
            expected.startsWith('/') && expected.endsWith('/')
              ? new RegExp(expected.slice(1, -1)).test(actual)
              : expected === actual;
          if (isEqual) break;
        }
        if (!isEqual) {
          throw new Error(
            `Page ${probeUrl} does not have expected response header ${header}.\n\nExpected: ${expected}.\n\nActual: ${formatHeaders(
              rawHeaders
            )}`
          );
        }
      }
    });
    hadTest = true;
  }

  if (probe.notResponseHeaders) {
    Object.keys(probe.notResponseHeaders).forEach(header => {
      const headerValue = resp.headers.get(header);
      const expected = probe.notResponseHeaders[header];

      if (headerValue === expected) {
        throw new Error(
          `Page ${probeUrl} has unexpected response header ${header}.\n\nDid not expect: ${header}=${expected}.\n\nAll: ${formatHeaders(
            rawHeaders
          )}`
        );
      }
    });
    hadTest = true;
  }

  assert(hadTest, 'probe must have a test condition');
}

async function testDeployment(fixturePath, opts) {
  const projectName =
    path
      .basename(fixturePath)
      .toLowerCase()
      .replace(/(_|\.)/g, '-') +
    '-' +
    Date.now() +
    '-' +
    Math.round(Math.random() * 1000);

  logWithinTest(`testDeployment "${projectName}"`);
  const globResult = await glob(`${fixturePath}/**`, {
    nodir: true,
    dot: true,
  });
  const bodies = globResult.reduce((b, f) => {
    let data;
    const r = path.relative(fixturePath, f);
    const stat = fs.lstatSync(f);
    if (stat.isSymbolicLink()) {
      data = Buffer.from(fs.readlinkSync(f), 'utf8');
    } else {
      data = fs.readFileSync(f);
    }
    data[fileModeSymbol] = stat.mode;
    b[r] = data;
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
  const nowJson = json5.parse(bodies[configName] || '{}');
  const uploadNowJson = nowJson.uploadNowJson;
  delete nowJson.uploadNowJson;

  const probePath = path.resolve(fixturePath, 'probe.js');
  let probes = [];
  if ('probes' in nowJson) {
    probes = nowJson.probes;
  } else if ('probes.json' in bodies) {
    probes = json5.parse(bodies['probes.json']).probes;
  } else if (fs.existsSync(probePath)) {
    // we'll run probes after we have the deployment url below
  } else {
    console.warn(
      `WARNING: Test fixture "${fixturePath}" does not contain probes.json, probe.js, or vercel.json`
    );
  }
  bodies[configName] = Buffer.from(JSON.stringify(nowJson));
  delete bodies['probe.js'];
  delete bodies['probes.json'];

  const { deploymentId, deploymentUrl } = await nowDeploy(
    projectName,
    bodies,
    randomness,
    uploadNowJson,
    opts
  );
  const probeCtx = {};

  if (fs.existsSync(probePath)) {
    await require(probePath)({ deploymentUrl, fetch, randomness });
  }

  for (const probe of probes) {
    const stringifiedProbe = JSON.stringify(probe);
    logWithinTest('testing', stringifiedProbe);

    try {
      await runProbe(probe, deploymentId, deploymentUrl, probeCtx);
    } catch (err) {
      if (!probe.retries) {
        throw err;
      }

      for (let i = 0; i < probe.retries; i++) {
        logWithinTest(`re-trying ${i + 1}/${probe.retries}:`, stringifiedProbe);

        try {
          await runProbe(probe, deploymentId, deploymentUrl, probeCtx);
          break;
        } catch (err) {
          if (i === probe.retries - 1) {
            throw err;
          }

          if (probe.retryDelay) {
            logWithinTest(`Waiting ${probe.retryDelay}ms before retrying`);
            await new Promise(resolve => setTimeout(resolve, probe.retryDelay));
          }
        }
      }
    }
  }

  return { deploymentId, deploymentUrl };
}

async function nowDeployIndexTgz(file) {
  const bodies = {
    'index.tgz': fs.readFileSync(file),
    'now.json': Buffer.from(JSON.stringify({ version: 2 })),
  };

  return (await nowDeploy('pack-n-deploy', bodies)).deploymentUrl;
}

async function fetchDeploymentUrl(url, opts) {
  for (let i = 0; i < 50; i += 1) {
    const resp = await fetch(url, opts);
    const text = await resp.text();
    if (typeof text !== 'undefined' && !text.includes('Join Free')) {
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
        if (result) logWithinTest(result);
        reject(new Error(`Exited with ${code || signal}`));
        return;
      }
      resolve(result);
    });
  });
}

/**
 * @param {Record<string, string[]>} headers
 */
function formatHeaders(headers) {
  return Object.entries(headers)
    .flatMap(([name, values]) => values.map(v => `  ${name}: ${v}`))
    .join('\n');
}

module.exports = {
  packAndDeploy,
  testDeployment,
};
