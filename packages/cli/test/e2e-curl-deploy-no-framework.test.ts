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

// Negative counterpart to e2e-curl-deploy.test.ts. The positive test creates a
// project implicitly (no framework field) so the API sets
// VERCEL_FIRST_DEPLOYMENT=1 and detection runs, persisting "node". Here the
// project is created explicitly with `framework: null`, which the API treats as
// an intentional opt-out — it does NOT set VERCEL_FIRST_DEPLOYMENT=1, so
// detection is skipped and the framework stays null.
describe('curl-based deployment via Vercel API — explicit no-framework opt-out', () => {
  let tmpDir: string;
  let tarball: string;
  let projectId: string | undefined;

  const projectName = `curl-deploy-no-fw-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const CLI_VERSION = process.env.VERCEL_CLI_VERSION;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curl-deploy-no-fw-'));
    fs.writeFileSync(
      path.join(tmpDir, 'server.ts'),
      'export default {\n' +
        '  fetch(request: Request) {\n' +
        "    return new Response('Hello from Vercel!');\n" +
        '  }\n' +
        '};\n'
    );

    tarball = path.join(tmpDir, 'project.tgz');
    execFileSync('tar', ['czf', tarball, '-C', tmpDir, 'server.ts']);
    console.log('created tarball at', tarball);
  });

  afterAll(() => {
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

  it('does not run framework detection and leaves framework null for an explicit opt-out', async () => {
    // Create the project explicitly with `framework: null` before deploying.
    // This marks the null as an intentional opt-out, so the API will not set
    // VERCEL_FIRST_DEPLOYMENT=1 and detection is skipped.
    const createBody = curl([
      '-X',
      'POST',
      apiUrl('/v1/projects'),
      '-H',
      `Authorization: Bearer ${TOKEN}`,
      '-H',
      'Content-Type: application/json',
      '-d',
      JSON.stringify({
        name: projectName,
        framework: null,
      }),
    ]);
    const createJson = JSON.parse(createBody);
    console.log('project create response:', createBody);
    expect(
      createJson.error,
      `Project creation failed: ${createBody}`
    ).toBeFalsy();
    expect(createJson.id, `Expected project id: ${createBody}`).toBeTruthy();
    projectId = createJson.id;

    const data = fs.readFileSync(tarball);
    const sha = createHash('sha1').update(new Uint8Array(data)).digest('hex');
    const size = data.length;
    console.log('tarball sha:', sha, 'size:', size);
    console.log(
      'VERCEL_CLI_VERSION:',
      CLI_VERSION ? CLI_VERSION : '<unset — build will use published CLI>'
    );

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

    const payload = {
      name: projectName,
      version: 2,
      files: [{ file: '.vercel/source.tgz.part1', sha, size, mode: 0o666 }],
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
    expect(
      deployJson.url,
      `Expected deployment url: ${deployBody}`
    ).toBeTruthy();

    // Poll the deployment until it is READY (or ERROR). Unlike the positive
    // test, we do NOT assert serving at `/`: with detection skipped there is no
    // framework slug, so the zero-config Node builder does not run and the build
    // produces no output. The contract under test is the framework-stays-null
    // assertion below, not that the deployment serves content.
    let readyState: string | undefined;
    for (let i = 0; i < 750; i += 1) {
      const statusBody = curl([
        apiUrl(`/v13/deployments/${encodeURIComponent(deploymentId)}`),
        '-H',
        `Authorization: Bearer ${TOKEN}`,
      ]);
      const statusJson = JSON.parse(statusBody);
      readyState = statusJson.readyState;
      console.log(`[poll ${i}] readyState=${readyState}`);
      if (readyState === 'READY') break;
      expect(readyState, `Deployment failed: ${statusBody}`).not.toBe('ERROR');
      await sleep(1000);
    }
    expect(
      readyState,
      `Deployment did not become READY (last state: ${readyState})`
    ).toBe('READY');

    // Core assertion: detection was skipped, so the explicit opt-out is
    // preserved rather than overwritten with a detected slug.
    const projectBody = curl([
      apiUrl(`/v9/projects/${encodeURIComponent(projectId!)}`),
      '-H',
      `Authorization: Bearer ${TOKEN}`,
    ]);
    const projectFramework = JSON.parse(projectBody).framework;
    expect(
      projectFramework,
      `Expected project framework to stay null (explicit opt-out), got: ${projectBody}`
    ).toBeNull();
  });
});
