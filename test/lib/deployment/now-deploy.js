const assert = require('assert');
const { createHash } = require('crypto');
const path = require('path');
const fetch = require('./fetch-retry.js');

const str = 'aHR0cHM6Ly9hcGktdG9rZW4tZmFjdG9yeS56ZWl0LnNo';

async function nowDeploy (bodies, randomness) {
  const files = Object.keys(bodies)
    .filter((n) => n !== 'now.json')
    .map((n) => ({
      sha: digestOfFile(bodies[n]),
      size: bodies[n].length,
      file: n,
      mode: path.extname(n) === '.sh' ? 0o100755 : 0o100644,
    }));

  const nowJson = JSON.parse(bodies['now.json']);

  const nowDeployPayload = {
    version: 2,
    public: true,
    env: { ...nowJson.env, RANDOMNESS_ENV_VAR: randomness },
    build: {
      env: {
        ...(nowJson.build || {}).env,
        RANDOMNESS_BUILD_ENV_VAR: randomness,
      },
    },
    name: 'test2020',
    files,
    builds: nowJson.builds,
    routes: nowJson.routes || [],
    meta: {},
  };

  if (process.env.FORCE_BUILD_IN_REGION) {
    const { builds=[] } = nowDeployPayload;
    builds.forEach(b => {
      if (!b.config) {
        b.config = {};
      }
      b.config.forceBuildIn = process.env.FORCE_BUILD_IN_REGION;
    });
  }

  console.log(`posting ${files.length} files`);

  for (const { file: filename } of files) {
    await filePost(bodies[filename], digestOfFile(bodies[filename]));
  }

  let deploymentId;
  let deploymentUrl;

  {
    const json = await deploymentPost(nowDeployPayload);
    if (json.error && json.error.code === 'missing_files') throw new Error('Missing files');
    deploymentId = json.id;
    deploymentUrl = json.url;
  }

  console.log('id', deploymentId);
  console.log('deploymentUrl', `https://${deploymentUrl}`);

  for (let i = 0; i < 750; i += 1) {
    const { state } = await deploymentGet(deploymentId);
    if (state === 'ERROR') throw new Error(`State of ${deploymentUrl} is ${state}`);
    if (state === 'READY') break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  return { deploymentId, deploymentUrl };
}

function digestOfFile (body) {
  return createHash('sha1')
    .update(body)
    .digest('hex');
}

async function filePost (body, digest) {
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
  });

  const json = await resp.json();

  if (json.error) {
    const { status, statusText, headers } = resp;
    const { message } = json.error;
    console.log('Fetch Error', { url , status, statusText, headers, digest });
    throw new Error(message);
  }
  return json;
}

async function deploymentPost (payload) {
  const url = '/v6/now/deployments?forceNew=1';
  const resp = await fetchWithAuth(url, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const json = await resp.json();

  if (json.error) {
    const { status, statusText, headers } = resp;
    const { message } = json.error;
    console.log('Fetch Error', { url , status, statusText, headers });
    throw new Error(message);
  }
  return json;
}

async function deploymentGet (deploymentId) {
  const url = `/v3/now/deployments/${deploymentId}`;
  const resp = await fetchWithAuth(url);
  const json = await resp.json();
  if (json.error) {
    const { status, statusText, headers } = resp;
    const { message } = json.error;
    console.log('Fetch Error', { url , status, statusText, headers });
    throw new Error(message);
  }
  return json
}

let token;
let currentCount = 0;
const MAX_COUNT = 10;

async function fetchWithAuth (url, opts = {}) {
  if (!opts.headers) opts.headers = {};

  if (!opts.headers.Authorization) {
    currentCount += 1;
    if (!token || currentCount === MAX_COUNT) {
      currentCount = 0;
      if (process.env.NOW_TOKEN) {
        // used for health checks
        token = process.env.NOW_TOKEN;
      } else {
        token = await fetchTokenWithRetry(
          Buffer.from(str, 'base64').toString()
        );
      }
    }

    opts.headers.Authorization = `Bearer ${token}`;
  }

  return await fetchApi(url, opts);
}

function fetchTokenWithRetry (url, retries = 3) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await fetch(url);
      const data = await res.json();
      resolve(data.token);
    } catch (error) {
      console.log(`Failed to fetch token. Retries remaining: ${retries}`);
      if (retries === 0) {
        reject(error);
        return;
      }
      setTimeout(() => {
        fetchTokenWithRetry(url, retries - 1)
          .then(resolve)
          .catch(reject);
      }, 500);
    }
  });
}

async function fetchApi (url, opts = {}) {
  const apiHost = process.env.API_HOST || 'api.zeit.co';
  const urlWithHost = `https://${apiHost}${url}`;
  const { method = 'GET', body } = opts;

  if (process.env.VERBOSE) {
    console.log('fetch', method, url);
    if (body) console.log(encodeURIComponent(body).slice(0, 80));
  }

  if (!opts.headers) opts.headers = {};

  if (!opts.headers.Accept) {
    opts.headers.Accept = 'application/json';
  }

  opts.headers['x-now-trace-priority'] = '1';

  return await fetch(urlWithHost, opts);
}

module.exports = {
  fetchApi,
  fetchWithAuth,
  nowDeploy,
};
