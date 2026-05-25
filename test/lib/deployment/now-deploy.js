// bust cache
const assert = require('assert');
const { createHash } = require('crypto');
const path = require('path');
const _fetch = require('node-fetch');
const fetch = require('./fetch-retry');
const fileModeSymbol = Symbol('fileMode');
const ms = require('ms');
const { handleTransientError } = require('./transient-error');

const IS_CI = !!process.env.CI;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function nowDeploy(projectName, bodies, randomness, uploadNowJson, opts) {
  const files = Object.keys(bodies)
    .filter(n =>
      uploadNowJson
        ? true
        : n !== 'vercel.json' &&
          n !== 'now.json' &&
          !n.includes('node_modules/') &&
          !n.includes('.git/') &&
          !n.includes('.next/')
    )
    .map(n => ({
      sha: digestOfFile(bodies[n]),
      size: bodies[n].length,
      file: n,
      mode:
        bodies[n][fileModeSymbol] ||
        (path.extname(n) === '.sh' ? 0o100755 : 0o100644),
    }));

  const {
    FORCE_BUILD_IN_REGION,
    VERCEL_DEBUG,
    VERCEL_CLI_VERSION,
    VERCEL_FORCE_PYTHON_STREAMING,
    VERCEL_FORCE_BUILD_IN_HIVE,
    VERCEL_BUILD_CONTAINER_VERSION,
    VERCEL_RUNTIME_PYTHON,
    VERCEL_WORKERS_PYTHON,
  } = process.env;

  // Warn if using custom build container configuration
  if (VERCEL_FORCE_BUILD_IN_HIVE || VERCEL_BUILD_CONTAINER_VERSION) {
    console.log('⚠️ Running tests against a custom build container');
    if (VERCEL_FORCE_BUILD_IN_HIVE) {
      console.log(`VERCEL_FORCE_BUILD_IN_HIVE=${VERCEL_FORCE_BUILD_IN_HIVE}`);
    }
    if (VERCEL_BUILD_CONTAINER_VERSION) {
      console.log(
        `VERCEL_BUILD_CONTAINER_VERSION=${VERCEL_BUILD_CONTAINER_VERSION}`
      );
    }
  }
  const nowJson = JSON.parse(
    bodies['vercel.json'] || bodies['now.json'] || '{}'
  );

  delete nowJson.probes;

  const nowDeployPayload = {
    version: 2,
    public: true,
    name: projectName,
    files,
    meta: {},
    ...nowJson,
    projectSettings: {
      ...nowJson.projectSettings,
      ...opts.projectSettings,
    },
    env: { ...nowJson.env, RANDOMNESS_ENV_VAR: randomness },
    build: {
      env: {
        ...(nowJson.build || {}).env,
        RANDOMNESS_BUILD_ENV_VAR: randomness,
        FORCE_BUILD_IN_REGION,
        VERCEL_DEBUG,
        VERCEL_CLI_VERSION,
        VERCEL_FORCE_PYTHON_STREAMING,
        VERCEL_FORCE_BUILD_IN_HIVE,
        VERCEL_BUILD_CONTAINER_VERSION,
        VERCEL_RUNTIME_PYTHON,
        VERCEL_WORKERS_PYTHON,
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  };

  console.log(`posting ${files.length} files`);

  for (const { file: filename } of files) {
    let attempts = 0;
    while (true) {
      try {
        await filePost(bodies[filename], digestOfFile(bodies[filename]));
        break;
      } catch (error) {
        if (handleTransientError(error, 'file_upload') && attempts < 3) {
          attempts++;
          console.log(
            `Transient error uploading ${filename} (attempt ${attempts}): ${error.message}`
          );
          await new Promise(r => setTimeout(r, 1000 * attempts));
          continue;
        }
        throw error;
      }
    }
  }

  let deploymentId;
  let deploymentUrl;

  {
    const json = await deploymentPost(nowDeployPayload, opts);
    if (json.error && json.error.code === 'missing_files')
      throw new Error('Missing files');
    deploymentId = json.id;
    deploymentUrl = json.url;
  }

  console.log('id', deploymentId);

  for (let i = 0; i < 750; i += 1) {
    let deployment;
    try {
      deployment = await deploymentGet(deploymentId);
    } catch (error) {
      if (handleTransientError(error, 'deployment_poll')) {
        console.log(
          `Transient error polling deployment ${deploymentId} (attempt ${i}): ${error.message}`
        );
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw error;
    }
    const { readyState } = deployment;
    if (readyState === 'ERROR') {
      console.log('state is ERROR, throwing');
      const error = new Error(
        `State of https://${deploymentUrl} is ERROR: ${deployment.errorMessage}`
      );
      error.deployment = deployment;
      throw error;
    }
    if (readyState === 'READY') {
      console.log(`State of https://${deploymentUrl} is READY, moving on`);
      break;
    }
    if (i % 25 === 0) {
      console.log(
        `State of https://${deploymentUrl} is ${readyState}, retry number ${i}`
      );
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  await disableSSO(deploymentId, deploymentUrl);

  return { deploymentId, deploymentUrl };
}

async function disableSSO(deploymentId, deploymentUrl) {
  const deployRes = await fetchWithAuth(
    `/v13/deployments/${encodeURIComponent(deploymentId)}`
  );
  if (!deployRes.ok) return;

  const { projectId } = await deployRes.json();
  if (!projectId) return;

  const settingRes = await fetchWithAuth(
    `/v5/projects/${encodeURIComponent(projectId)}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ssoProtection: null }),
    }
  );

  if (!settingRes.ok) {
    console.log(
      `Warning: failed to disable SSO protection (status: ${settingRes.status})`
    );
    return;
  }

  // Wait for the SSO change to propagate
  for (let i = 0; i < 10; i++) {
    let res;
    try {
      res = await _fetch(`https://${deploymentUrl}`);
    } catch (error) {
      if (handleTransientError(error, 'sso_propagation')) {
        console.log(
          `Transient error checking SSO propagation for ${deploymentUrl} (attempt ${i}): ${error.message}`
        );
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      throw error;
    }
    if (res.status !== 401) return;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

function digestOfFile(body) {
  return createHash('sha1').update(body).digest('hex');
}

async function filePost(body, digest) {
  assert(Buffer.isBuffer(body));

  const headers = {
    'Content-Type': 'application/octet-stream',
    'Content-Length': body.length,
    'x-now-digest': digest,
    'x-now-size': body.length,
  };

  const url = '/v2/now/files';

  const resp = await fetchWithAuth(url, {
    method: 'POST',
    headers,
    body,
    timeout: ms('30s'),
  });

  const json = await resp.json();

  if (json.error) {
    const { status, statusText, headers } = resp;
    const { message } = json.error;
    console.log('Fetch Error', { url, status, statusText, headers, digest });
    throw new Error(message);
  }
  return json;
}

async function deploymentPost(payload, opts = {}) {
  const url = `/v13/deployments?skipAutoDetectionConfirmation=1${
    // skipForceNew allows turbo cache to be leveraged
    !opts.skipForceNew ? `&forceNew=1` : ''
  }`;
  const resp = await fetchWithAuth(url, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const json = await resp.json();

  if (json.error) {
    const { status, statusText, headers } = resp;
    const { message } = json.error;
    console.log('Fetch Error', { url, status, statusText, headers });
    throw new Error(message);
  }
  return json;
}

async function deploymentGet(deploymentId) {
  const url = `/v13/deployments/${deploymentId}`;
  const resp = await fetchWithAuth(url);
  const json = await resp.json();
  if (json.error) {
    const { status, statusText, headers } = resp;
    const { message } = json.error;
    console.log('Fetch Error', { url, status, statusText, headers, message });
    throw new Error(message);
  }
  return json;
}

let token;
let tokenCreated = 0;
// temporary tokens last for 25 minutes
const MAX_TOKEN_AGE = 25 * 60 * 1000;

async function fetchWithAuth(url, opts = {}) {
  if (!opts.headers) opts.headers = {};

  if (!opts.headers.Authorization) {
    opts.headers.Authorization = `Bearer ${await fetchCachedToken()}`;
  }

  const { VERCEL_TEAM_ID } = process.env;

  if (VERCEL_TEAM_ID) {
    url += `${url.includes('?') ? '&' : '?'}teamId=${VERCEL_TEAM_ID}`;
  }

  return await fetchApi(url, opts);
}

/**
 * @returns { Promise<String> }
 */
async function fetchCachedToken() {
  if (!token || tokenCreated < Date.now() - MAX_TOKEN_AGE) {
    return fetchTokenWithRetry();
  }
  return token;
}

/**
 * @returns { Promise<String> }
 */
async function fetchTokenWithRetry(retries = 5) {
  const {
    NOW_TOKEN,
    TEMP_TOKEN,
    VERCEL_TOKEN,
    VERCEL_TEST_TOKEN,
    VERCEL_TEST_REGISTRATION_URL,
  } = process.env;
  if (VERCEL_TOKEN || NOW_TOKEN || TEMP_TOKEN) {
    if (!TEMP_TOKEN && !IS_CI) {
      console.log('Your personal token will be used to make test deployments.');
    }
    return VERCEL_TOKEN || NOW_TOKEN || TEMP_TOKEN;
  }
  if (!VERCEL_TEST_TOKEN || !VERCEL_TEST_REGISTRATION_URL) {
    throw new Error(
      IS_CI
        ? 'Failed to create test deployment. This is expected for 3rd-party Pull Requests. Please run tests locally.'
        : 'Failed to create test deployment. Please set `VERCEL_TOKEN` environment variable and run again.'
    );
  }
  try {
    const res = await _fetch(VERCEL_TEST_REGISTRATION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VERCEL_TEST_TOKEN}`,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Unexpected status (${res.status}) from registration: ${text}`
      );
    }
    const data = await res.json();
    if (!data) {
      throw new Error(`Unexpected response from registration: no body`);
    }
    if (!data.token) {
      const text = JSON.stringify(data);
      throw new Error(`Unexpected response from registration: ${text}`);
    }

    // Cache the token to be returned via `fetchCachedToken`
    token = data.token;
    tokenCreated = Date.now();

    return data.token;
  } catch (error) {
    console.log(
      `Failed to fetch token. Retries remaining: ${retries}`,
      error.message
    );
    if (retries === 0) {
      console.log(error);
      throw error;
    }
    await sleep(500);
    return fetchTokenWithRetry(retries - 1);
  }
}

async function fetchApi(url, opts = {}) {
  const { method = 'GET', body } = opts;
  const apiHost = process.env.API_HOST || 'api.vercel.com';
  const urlWithHost = url.startsWith('https://')
    ? url
    : `https://${apiHost}${url}`;

  if (process.env.VERBOSE) {
    console.log('fetch', method, url);
    if (body) console.log(encodeURIComponent(body).slice(0, 80));
  }

  if (!opts.headers) opts.headers = {};

  if (!opts.headers.Accept) {
    opts.headers.Accept = 'application/json';
  }

  if (typeof opts.timeout === 'undefined') {
    opts.timeout = ms('30s');
  }

  opts.headers['x-now-trace-priority'] = '1';

  return await fetch(urlWithHost, opts);
}

module.exports = {
  fetchApi,
  fetchWithAuth,
  nowDeploy,
  fetchCachedToken,
  fetchTokenWithRetry,
  fileModeSymbol,
};
