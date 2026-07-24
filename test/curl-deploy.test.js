const assert = require('assert');
const { execFileSync } = require('child_process');
const { createHash } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fetchCachedToken } = require('./lib/deployment/now-deploy');

const API_HOST = process.env.API_HOST || 'api.vercel.com';

/**
 * Build a fully-qualified API URL, appending the `teamId` query param when
 * `VERCEL_TEAM_ID` is set (mirrors the behavior in now-deploy.js).
 */
function apiUrl(p, query) {
  let url = `https://${API_HOST}${p}`;
  const parts = [
    query,
    process.env.VERCEL_TEAM_ID && `teamId=${process.env.VERCEL_TEAM_ID}`,
  ].filter(Boolean);
  if (parts.length) url += `?${parts.join('&')}`;
  return url;
}

/** Run curl with `-sS` and return stdout as a string. */
function curl(args) {
  return execFileSync('curl', ['-sS', ...args], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

describe('curl-based deployment via Vercel API', () => {
  let token;
  let tmpDir;
  let tarball;
  let projectId;

  beforeAll(async () => {
    token = await fetchCachedToken();

    // Create a minimal Node project: just server.ts
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curl-deploy-'));
    fs.writeFileSync(
      path.join(tmpDir, 'server.ts'),
      'export default {\n' +
        '  fetch(request: Request) {\n' +
        "    return new Response('Hello from Vercel!');\n" +
        '  }\n' +
        '};\n'
    );

    // Pack the project into a gzipped tarball (matches `--archive=tgz`)
    tarball = path.join(tmpDir, 'project.tgz');
    execFileSync('tar', ['czf', tarball, '-C', tmpDir, 'server.ts']);
    console.log('created tarball at', tarball);
  });

  afterAll(async () => {
    // Delete the project created by this test.
    if (projectId) {
      const deleteBody = curl([
        '-X',
        'DELETE',
        apiUrl(`/v9/projects/${encodeURIComponent(projectId)}`),
        '-H',
        `Authorization: Bearer ${token}`,
      ]);
      console.log('project delete response:', deleteBody || '(empty)');
    }
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uploads the tarball, deploys, and serves "Hello from Vercel!" at /', async () => {
    const data = fs.readFileSync(tarball);
    const sha = createHash('sha1').update(data).digest('hex');
    const size = data.length;
    console.log('tarball sha:', sha, 'size:', size);

    // 1. Upload the tarball to the files endpoint (same headers the CLI sends
    //    in packages/client/src/upload.ts for --archive=tgz chunks).
    const uploadBody = curl([
      '-X',
      'POST',
      apiUrl('/v2/files'),
      '-H',
      `Authorization: Bearer ${token}`,
      '-H',
      'Content-Type: application/octet-stream',
      '-H',
      `x-now-digest: ${sha}`,
      '-H',
      `x-now-size: ${size}`,
      '--data-binary',
      `@${tarball}`,
    ]);
    const uploadJson = JSON.parse(uploadBody);
    assert.ok(!uploadJson.error, `File upload failed: ${uploadBody}`);

    // 2. Create a deployment referencing the uploaded tarball chunk. The
    //    `.vercel/source.tgz.part1` file name is what the server expects for
    //    archive deployments (see packages/client/src/utils/archive.ts).
    const payload = {
      name: 'curl-deploy-test',
      version: 2,
      files: [{ file: '.vercel/source.tgz.part1', sha, size, mode: 0o666 }],
    };

    const deployBody = curl([
      '-X',
      'POST',
      apiUrl('/v13/deployments', 'skipAutoDetectionConfirmation=1&forceNew=1'),
      '-H',
      `Authorization: Bearer ${token}`,
      '-H',
      'Content-Type: application/json',
      '-d',
      JSON.stringify(payload),
    ]);
    const deployJson = JSON.parse(deployBody);
    console.log('deployment response:', deployBody);

    assert.ok(!deployJson.error, `Deployment creation failed: ${deployBody}`);
    assert.ok(deployJson.id, `Expected deployment id: ${deployBody}`);

    const deploymentId = deployJson.id;
    const deploymentUrl = deployJson.url;
    projectId = deployJson.projectId;
    assert.ok(deploymentUrl, `Expected deployment url: ${deployBody}`);

    // 3. Poll the deployment until it is READY (or ERROR).
    let readyState;
    for (let i = 0; i < 750; i += 1) {
      const statusBody = curl([
        apiUrl(`/v13/deployments/${encodeURIComponent(deploymentId)}`),
        '-H',
        `Authorization: Bearer ${token}`,
      ]);
      const statusJson = JSON.parse(statusBody);
      readyState = statusJson.readyState;
      if (!projectId && statusJson.projectId) projectId = statusJson.projectId;
      if (readyState === 'READY') break;
      assert.notStrictEqual(
        readyState,
        'ERROR',
        `Deployment failed: ${statusBody}`
      );
      await sleep(1000);
    }
    assert.strictEqual(
      readyState,
      'READY',
      `Deployment did not become READY (last state: ${readyState})`
    );

    // 4. Disable SSO protection so the deployment is publicly reachable, then
    //    probe `/` and assert it responds with the expected text.
    if (projectId) {
      curl([
        '-X',
        'PATCH',
        apiUrl(`/v5/projects/${encodeURIComponent(projectId)}`),
        '-H',
        `Authorization: Bearer ${token}`,
        '-H',
        'Content-Type: application/json',
        '-d',
        JSON.stringify({ ssoProtection: null }),
      ]);
    }

    let body;
    for (let i = 0; i < 30; i += 1) {
      body = curl([`https://${deploymentUrl}/`]);
      if (body.includes('Hello from Vercel!')) break;
      await sleep(1000);
    }
    assert.ok(
      body.includes('Hello from Vercel!'),
      `Expected "Hello from Vercel!" at /, got: ${body}`
    );
  });
});
