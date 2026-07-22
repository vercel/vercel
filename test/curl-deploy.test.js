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

describe('curl-based deployment via Vercel API', () => {
  let token;
  let tmpDir;
  let tarball;

  beforeAll(async () => {
    token = await fetchCachedToken();
  });

  beforeAll(() => {
    // Create a minimal Node project: api/server.ts + vercel.json
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curl-deploy-'));
    fs.mkdirSync(path.join(tmpDir, 'api'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'api/server.ts'),
      "export default function handler(_req: any, res: any) {\n" +
        "  res.status(200).json({ hello: 'world' });\n" +
        '}\n'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'vercel.json'),
      JSON.stringify({ version: 2 }, null, 2)
    );

    // Pack the project into a gzipped tarball (matches `--archive=tgz`)
    tarball = path.join(tmpDir, 'project.tgz');
    execFileSync('tar', ['czf', tarball, '-C', tmpDir, 'api', 'vercel.json']);
    console.log('created tarball at', tarball);
  });

  afterAll(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uploads the tarball to /v2/files and creates a deployment via /v13/deployments', () => {
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
      apiUrl(
        '/v13/deployments',
        'skipAutoDetectionConfirmation=1&forceNew=1'
      ),
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
  });
});
