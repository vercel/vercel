#!/usr/bin/env node
/**
 * Standalone replica of test/curl-deploy.test.js for manual testing. Uses raw
 * `curl` calls to:
 *   1. tar a minimal Node project (just server.ts)
 *   2. POST the tarball to /v2/files
 *   3. POST a deployment to /v13/deployments referencing the uploaded tarball
 *
 * Usage (same env vars as the CLI e2e tests):
 *   VERCEL_TOKEN=<token> VERCEL_TEAM_ID=<team> node test/curl-deploy-run.js
 *
 * Optional env vars:
 *   API_HOST  (defaults to api.vercel.com)
 */

const { execFileSync } = require('child_process');
const { createHash, randomBytes } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TOKEN = process.env.VERCEL_TOKEN;
const TEAM_ID = process.env.VERCEL_TEAM_ID;
const API_HOST = process.env.API_HOST || 'api.vercel.com';

if (!TOKEN || !TEAM_ID) {
  console.error(
    'Error: VERCEL_TOKEN and VERCEL_TEAM_ID environment variables are required. Example:\n' +
      '  VERCEL_TOKEN=<token> VERCEL_TEAM_ID=<team> node test/curl-deploy-run.js'
  );
  process.exit(1);
}

/** Build a fully-qualified API URL with the teamId query param. */
function apiUrl(p, query) {
  let url = `https://${API_HOST}${p}`;
  const parts = [query, `teamId=${TEAM_ID}`].filter(Boolean);
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

function main() {
  // 1. Create a minimal Node project in a temp dir.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curl-deploy-'));
  try {
    fs.writeFileSync(
      path.join(tmpDir, 'server.ts'),
      'export default {\n' +
        '  fetch(request: Request) {\n' +
        "    return new Response('Hello from Vercel!');\n" +
        '  }\n' +
        '};\n'
    );

    // 2. Pack the project into a gzipped tarball (matches `--archive=tgz`).
    const tarball = path.join(tmpDir, 'project.tgz');
    execFileSync('tar', ['czf', tarball, '-C', tmpDir, 'server.ts']);
    console.log('created tarball at', tarball);

    const data = fs.readFileSync(tarball);
    const sha = createHash('sha1').update(data).digest('hex');
    const size = data.length;
    console.log('tarball sha:', sha, 'size:', size);

    // 3. Upload the tarball to /v2/files (same headers the CLI sends for
    //    --archive=tgz chunks; see packages/client/src/upload.ts).
    console.log('\nUploading tarball to /v2/files...');
    const uploadBody = curl([
      '-X',
      'POST',
      apiUrl('/v2/files'),
      '-H',
      `Authorization: Bearer ${TOKEN}`,
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
    if (uploadJson.error) {
      throw new Error(`File upload failed: ${uploadBody}`);
    }
    console.log('upload OK:', uploadBody);

    // 4. Create a deployment referencing the uploaded tarball chunk. The
    //    `.vercel/source.tgz.part1` file name is what the server expects for
    //    archive deployments (see packages/client/src/utils/archive.ts).
    const payload = {
      name: `curl-deploy-test-${randomBytes(4).toString('hex')}`,
      version: 2,
      files: [{ file: '.vercel/source.tgz.part1', sha, size, mode: 0o666 }],
      build: {
        env: {
          VERCEL_FRAMEWORK_DETECTION: '1',
        },
      },
    };

    console.log('\nCreating deployment via /v13/deployments...');
    const deployBody = curl([
      '-X',
      'POST',
      apiUrl('/v13/deployments', 'skipAutoDetectionConfirmation=1&forceNew=1'),
      '-H',
      `Authorization: Bearer ${TOKEN}`,
      '-H',
      'Content-Type: application/json',
      '-d',
      JSON.stringify(payload),
    ]);
    const deployJson = JSON.parse(deployBody);
    console.log('deployment response:', deployBody);

    if (deployJson.error) {
      throw new Error(`Deployment creation failed: ${deployBody}`);
    }
    if (!deployJson.id) {
      throw new Error(`Expected deployment id: ${deployBody}`);
    }

    console.log(`\n✓ Deployment created: https://${deployJson.url}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
