import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TEST_TIMEOUT = 15 * 60 * 1000;
vi.setConfig({ testTimeout: TEST_TIMEOUT, hookTimeout: TEST_TIMEOUT });

const API_HOST = process.env.API_HOST || 'api.vercel.com';
const TOKEN = process.env.VERCEL_TOKEN;
const TEAM_ID = process.env.VERCEL_TEAM_ID;

/**
 * Build a fully-qualified API URL, appending the `teamId` query param when
 * `VERCEL_TEAM_ID` is set (matches the CLI e2e helper in helpers/api-fetch.ts).
 */
function apiUrl(p: string, query?: string): string {
  let url = `https://${API_HOST}${p}`;
  const parts = [query, TEAM_ID && `teamId=${TEAM_ID}`].filter(Boolean);
  if (parts.length) url += `?${parts.join('&')}`;
  return url;
}

/** Run curl with `-sS` and return stdout as a string. */
function curl(args: string[]): string {
  return execFileSync('curl', ['-sS', ...args], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('curl-based deployment via Vercel API', () => {
  let tmpDir: string;
  let tarball: string;
  let projectId: string | undefined;

  // Use a unique project name per run so every deployment is a genuine first
  // deployment. Zero-config framework detection (which lets a bare `server.ts`
  // be built and served at `/`) only runs when the API sets
  // `VERCEL_FIRST_DEPLOYMENT=1`, and that is only set for a project's very
  // first deployment (see api `is-first-deployment.ts`). Reusing a fixed
  // project name would make the project exist after the first run, so
  // subsequent runs would never exercise the first-deployment path.
  const projectName = `curl-deploy-test-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  // URL of the CLI tarball built for this PR (set by the CI "Wait for
  // deployment tarballs" step). Forwarding it as `VERCEL_CLI_VERSION` in the
  // deployment's build env makes the server-side build run THIS PR's builder,
  // rather than the published CLI — this is how the existing deploy e2e tests
  // exercise branch code server-side (see test/dev/utils.ts).
  const CLI_VERSION = process.env.VERCEL_CLI_VERSION;

  beforeAll(() => {
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

  afterAll(() => {
    // Clean up the project created by this test so runs don't accumulate
    // projects in the team.
    if (projectId) {
      try {
        curl([
          '-X',
          'DELETE',
          apiUrl(`/v9/projects/${encodeURIComponent(projectId)}`),
          '-H',
          `Authorization: Bearer ${TOKEN}`,
        ]);
      } catch (err) {
        console.log(`Failed to delete project ${projectId}: ${err}`);
      }
    }
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uploads the tarball, deploys, and serves "Hello from Vercel!" at /', async () => {
    const data = fs.readFileSync(tarball);
    const sha = createHash('sha1').update(new Uint8Array(data)).digest('hex');
    const size = data.length;
    console.log('tarball sha:', sha, 'size:', size);
    console.log(
      'VERCEL_CLI_VERSION:',
      CLI_VERSION ? CLI_VERSION : '<unset — build will use published CLI>'
    );

    // 1. Upload the tarball to the files endpoint (same headers the CLI sends
    //    in packages/client/src/upload.ts for --archive=tgz chunks).
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
    expect(uploadJson.error, `File upload failed: ${uploadBody}`).toBeFalsy();

    // 2. Create a deployment referencing the uploaded tarball chunk. The
    //    `.vercel/source.tgz.part1` file name is what the server expects for
    //    archive deployments (see packages/client/src/utils/archive.ts).
    const payload = {
      name: projectName,
      version: 2,
      files: [{ file: '.vercel/source.tgz.part1', sha, size, mode: 0o666 }],
      // The unique `projectName` guarantees a first deployment, so the API sets
      // `VERCEL_FIRST_DEPLOYMENT=1` and `server.ts` is detected as `node`.
      //
      // Pin the server-side build to THIS PR's CLI tarball via
      // VERCEL_CLI_VERSION so our branch's first-deployment detection actually
      // runs (matches how test/dev/utils.ts passes --build-env
      // VERCEL_CLI_VERSION). Without it the build uses the published CLI.
      ...(CLI_VERSION
        ? { build: { env: { VERCEL_CLI_VERSION: CLI_VERSION } } }
        : {}),
    };

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

    expect(
      deployJson.error,
      `Deployment creation failed: ${deployBody}`
    ).toBeFalsy();
    expect(deployJson.id, `Expected deployment id: ${deployBody}`).toBeTruthy();

    const deploymentId = deployJson.id;
    const deploymentUrl = deployJson.url;
    projectId = deployJson.projectId;
    expect(
      deploymentUrl,
      `Expected deployment url: ${deployBody}`
    ).toBeTruthy();

    // 3. Poll the deployment until it is READY (or ERROR).
    let readyState: string | undefined;
    for (let i = 0; i < 750; i += 1) {
      const statusBody = curl([
        apiUrl(`/v13/deployments/${encodeURIComponent(deploymentId)}`),
        '-H',
        `Authorization: Bearer ${TOKEN}`,
      ]);
      const statusJson = JSON.parse(statusBody);
      readyState = statusJson.readyState;
      if (!projectId && statusJson.projectId) projectId = statusJson.projectId;
      console.log(`[poll ${i}] readyState=${readyState}`);
      if (readyState === 'READY') break;
      expect(readyState, `Deployment failed: ${statusBody}`).not.toBe('ERROR');
      await sleep(1000);
    }
    expect(
      readyState,
      `Deployment did not become READY (last state: ${readyState})`
    ).toBe('READY');

    // 4. Disable SSO protection so the deployment is publicly reachable, then
    //    probe `/` and assert it responds with the expected text. This is the
    //    primary success signal: the deployment actually serves our content.
    expect(projectId, 'Expected a projectId to read settings').toBeTruthy();
    if (projectId) {
      curl([
        '-X',
        'PATCH',
        apiUrl(`/v5/projects/${encodeURIComponent(projectId)}`),
        '-H',
        `Authorization: Bearer ${TOKEN}`,
        '-H',
        'Content-Type: application/json',
        '-d',
        JSON.stringify({ ssoProtection: null }),
      ]);
    }

    let body = '';
    for (let i = 0; i < 30; i += 1) {
      body = curl([`https://${deploymentUrl}/`]);
      console.log(
        `[serve poll ${i}] body=${JSON.stringify(body.slice(0, 200))}`
      );
      if (body.includes('Hello from Vercel!')) break;
      await sleep(1000);
    }
    expect(
      body.includes('Hello from Vercel!'),
      `Expected "Hello from Vercel!" at /, got: ${body}`
    ).toBe(true);

    // 5. Assert the detected framework ("node" for a bare `server.ts`) was
    //    persisted to the project by first-deployment detection.
    const projectBody = curl([
      apiUrl(`/v9/projects/${encodeURIComponent(projectId!)}`),
      '-H',
      `Authorization: Bearer ${TOKEN}`,
    ]);
    const projectFramework = JSON.parse(projectBody).framework;
    expect(
      projectFramework,
      `Expected project framework "node" to be persisted, got: ${projectBody}`
    ).toBe('node');
  });
});
