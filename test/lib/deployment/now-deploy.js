const assert = require('assert');
const { createHash } = require('crypto');
const path = require('path');
const _fetch = require('node-fetch');
const fetch = require('./fetch-retry.js');
const fileModeSymbol = Symbol('fileMode');
const { logWithinTest } = require('./log');
const ms = require('ms');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function nowDeploy(bodies, randomness, uploadNowJson) {
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

  const { FORCE_BUILD_IN_REGION, NOW_DEBUG, VERCEL_DEBUG } = process.env;
  const nowJson = JSON.parse(bodies['vercel.json'] || bodies['now.json']);

  const nowDeployPayload = {
    version: 2,
    public: true,
    env: { ...nowJson.env, RANDOMNESS_ENV_VAR: randomness },
    build: {
      env: {
        ...(nowJson.build || {}).env,
        RANDOMNESS_BUILD_ENV_VAR: randomness,
        FORCE_BUILD_IN_REGION,
        NOW_DEBUG,
        VERCEL_DEBUG,
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
    name: 'test2020',
    files,
    builds: nowJson.builds,
    meta: {},
  };

  for (const field of ['routes', 'rewrites', 'headers', 'redirects']) {
    if (nowJson[field]) {
      nowDeployPayload[field] = nowJson[field];
    }
  }

  logWithinTest(`posting ${files.length} files`);

  for (const { file: filename } of files) {
    await filePost(bodies[filename], digestOfFile(bodies[filename]));
  }

  let deploymentId;
  let deploymentUrl;

  {
    const json = await deploymentPost(nowDeployPayload);
    if (json.error && json.error.code === 'missing_files')
      throw new Error('Missing files');
    deploymentId = json.id;
    deploymentUrl = json.url;
  }

  logWithinTest('id', deploymentId);
  const st = typeof expect !== 'undefined' ? expect.getState() : {};
  const expectstate = {
    currentTestName: st.currentTestName,
    testPath: st.testPath,
  };
  logWithinTest('deploymentUrl', `https://${deploymentUrl}`, expectstate);

  for (let i = 0; i < 750; i += 1) {
    const deployment = await deploymentGet(deploymentId);
    const { readyState } = deployment;
    if (readyState === 'ERROR') {
      logWithinTest('state is ERROR, throwing');
      const error = new Error(`State of https://${deploymentUrl} is ERROR`);
      error.deployment = deployment;
      throw error;
    }
    if (readyState === 'READY') {
      logWithinTest('state is READY, moving on');
      break;
    }
    logWithinTest('state is ', readyState, 'retrying in 1 second');
    await new Promise(r => setTimeout(r, 1000));
  }

  return { deploymentId, deploymentUrl };
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
    logWithinTest('Fetch Error', { url, status, statusText, headers, digest });
    throw new Error(message);
  }
  return json;
}

async function deploymentPost(payload) {
  const url = '/v6/now/deployments?forceNew=1';
  const resp = await fetchWithAuth(url, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const json = await resp.json();

  if (json.error) {
    const { status, statusText, headers } = resp;
    const { message } = json.error;
    logWithinTest('Fetch Error', { url, status, statusText, headers });
    throw new Error(message);
  }
  return json;
}

async function deploymentGet(deploymentId) {
  const url = `/v12/now/deployments/${deploymentId}`;
  logWithinTest('fetching deployment', url);
  const resp = await fetchWithAuth(url);
  const json = await resp.json();
  if (json.error) {
    const { status, statusText, headers } = resp;
    const { message } = json.error;
    logWithinTest('Fetch Error', { url, status, statusText, headers, message });
    throw new Error(message);
  }
  return json;
}

let token;
let currentCount = 0;
const MAX_COUNT = 10;

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

async function fetchCachedToken() {
  currentCount += 1;
  if (!token || currentCount === MAX_COUNT) {
    currentCount = 0;
    token = await fetchTokenWithRetry();
  }
  return token;
}

async function fetchTokenWithRetry(retries = 5) {
  const {
    NOW_TOKEN,
    TEMP_TOKEN,
    VERCEL_TOKEN,
    VERCEL_TEAM_TOKEN,
    VERCEL_REGISTRATION_URL,
  } = process.env;
  if (VERCEL_TOKEN || NOW_TOKEN || TEMP_TOKEN) {
    if (!TEMP_TOKEN) {
      logWithinTest(
        'Your personal token will be used to make test deployments.'
      );
    }
    return VERCEL_TOKEN || NOW_TOKEN || TEMP_TOKEN;
  }
  if (!VERCEL_TEAM_TOKEN || !VERCEL_REGISTRATION_URL) {
    throw new Error(
      process.env.CI
        ? 'Failed to create test deployment. This is expected for 3rd-party Pull Requests. Please run tests locally.'
        : 'Failed to create test deployment. Please set `VERCEL_TOKEN` environment variable and run again.'
    );
  }
  try {
    const res = await _fetch(VERCEL_REGISTRATION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VERCEL_TEAM_TOKEN}`,
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
    return data.token;
  } catch (error) {
    logWithinTest(
      `Failed to fetch token. Retries remaining: ${retries}`,
      error.message
    );
    if (retries === 0) {
      logWithinTest(error);
      throw error;
    }
    await sleep(500);
    return fetchTokenWithRetry(retries - 1);
  }
}

async function fetchApi(url, opts = {}) {
  const apiHost = process.env.API_HOST || 'api.vercel.com';
  const urlWithHost = `https://${apiHost}${url}`;
  const { method = 'GET', body } = opts;

  if (process.env.VERBOSE) {
    logWithinTest('fetch', method, url);
    if (body) logWithinTest(encodeURIComponent(body).slice(0, 80));
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
  fetchTokenWithRetry,
  fetchCachedToken,
  fileModeSymbol,
};
