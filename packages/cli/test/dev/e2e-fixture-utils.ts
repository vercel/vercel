import fs from 'fs-extra';
import os from 'os';
import { basename, dirname, join } from 'path';
import nodeFetch from '../../src/util/fetch';
import { testFixture } from './utils';
import {
  runProbes,
  loadFixtureConfig,
  loadFixtureProbes,
  // @ts-ignore
} from '../../../../test/lib/deployment/test-deployment';

const XFAIL_FILENAME = 'VC_DEV_XFAIL';

// copy of intoChunks from utils/chunk-tests.js (importing that script would
// pull its @ts-check'd dependencies into this package's type-check)
function intoChunks<T>(minChunks: number, maxChunks: number, arr: T[]): T[][] {
  const chunkSize = Math.max(minChunks, Math.ceil(arr.length / maxChunks));
  const chunks: T[][] = [];
  for (let i = 0; i < maxChunks; i++) {
    chunks.push(arr.slice(i * chunkSize, (i + 1) * chunkSize));
  }
  return chunks.filter(x => x.length > 0);
}

/**
 * Files/directories never copied into the temp fixture copy: VCS and install
 * artifacts that `vc dev` recreates itself, plus test-runner metadata.
 */
const COPY_EXCLUDES = new Set([
  '.git',
  '.vercel',
  'node_modules',
  '.venv',
  '__pycache__',
  '.next',
  'dist',
  'probes.json',
  XFAIL_FILENAME,
]);

export interface FixtureCase {
  /** directory basename, e.g. '03-services-frontend-backend' */
  name: string;
  /** absolute path to the source fixture directory */
  dir: string;
  /** parsed probes from probes.json (or the `probes` key of vercel.json) */
  probes: Array<Record<string, any>>;
  /** trimmed VC_DEV_XFAIL file content ('' allowed), or null when absent */
  xfail: string | null;
}

/**
 * Enumerate the fixture directories that carry probes. Directories without
 * probes (e.g. local-only leftovers) are skipped.
 */
export function collectFixtures(fixturesDir: string): FixtureCase[] {
  return fs
    .readdirSync(fixturesDir)
    .filter(name => fs.statSync(join(fixturesDir, name)).isDirectory())
    .sort()
    .map(name => {
      const dir = join(fixturesDir, name);
      const probes: FixtureCase['probes'] = loadFixtureProbes(dir);
      const xfailPath = join(dir, XFAIL_FILENAME);
      const xfail = fs.existsSync(xfailPath)
        ? fs.readFileSync(xfailPath, 'utf8').trim()
        : null;
      return { name, dir, probes, xfail };
    })
    .filter(f => f.probes.length > 0);
}

/**
 * Copy a fixture to a fresh temp directory so `vc dev` can write
 * `.vercel/dev.lock` and install dependencies without polluting the source
 * fixture (which the deployment e2e tests upload wholesale).
 */
export async function prepareFixtureCopy(srcDir: string): Promise<string> {
  const tempRoot = await fs.mkdtemp(join(os.tmpdir(), 'vc-dev-e2e-'));
  const dest = join(tempRoot, basename(srcDir));
  await fs.copy(srcDir, dest, {
    filter: src => !COPY_EXCLUDES.has(basename(src)),
  });
  return dest;
}

/**
 * Wait until the dev proxy actually serves traffic. In services mode the
 * "Available at:" banner is printed before the services finish starting
 * (installs included), so poll until a request gets a real response,
 * tolerating connection errors and 502/504 from the proxy while a service
 * is still booting. Matches the orchestrator's 5 minute startup timeout.
 */
export async function waitForDevReady(
  dev: { exitCode: number | null },
  origin: string,
  path: string,
  timeoutMs: number = 5 * 60 * 1000
): Promise<void> {
  const url = `${origin}${path}`;
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no request completed';
  while (Date.now() < deadline) {
    if (dev.exitCode !== null) {
      throw new Error(`\`vc dev\` exited with code ${dev.exitCode}`);
    }
    try {
      const res = await nodeFetch(url);
      if (res.status !== 502 && res.status !== 504) {
        return;
      }
      lastError = `received status ${res.status}`;
    } catch (err: any) {
      lastError = err.message;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for dev server at ${url} (${lastError})`
  );
}

function firstProbePath(probes: FixtureCase['probes']): string {
  const probe = probes.find(
    p => typeof p.path === 'string' && !p.path.includes('__NEXT_SCRIPT__')
  );
  return probe?.path ?? '/';
}

function hasServicesConfig(dir: string): boolean {
  const config = loadFixtureConfig(dir) as Record<string, any> | null;
  return Boolean(
    config &&
      (config.services ||
        config.experimentalServices ||
        config.experimentalServicesV2)
  );
}

/**
 * Full lifecycle for one fixture: copy to a temp dir, start `vc dev --local`,
 * wait for it to serve traffic, then run the fixture's probes against it.
 */
export async function runFixtureAgainstDev(fixture: FixtureCase) {
  const tempDir = await prepareFixtureCopy(fixture.dir);
  // The services orchestrator syncs dependencies itself; only plain
  // (non-services) fixtures need the install that the deploy build would do.
  const hasServices = hasServicesConfig(tempDir);
  const { dev, port, readyResolver } = await testFixture(
    tempDir,
    {
      skipNpmInstall: hasServices,
      env: {
        VERCEL_USE_EXPERIMENTAL_SERVICES: '1',
        VERCEL_USE_EXPERIMENTAL_FRAMEWORKS: '1',
      },
    },
    ['--local']
  );
  try {
    await readyResolver;
    // readyResolver also resolves when the process closes or errors
    expect(dev.exitCode).toBeNull();
    const origin = `http://localhost:${port}`;
    // probes marked "skipDev": true only apply to real deployments
    // (e.g. asserting https:// service URLs)
    const probes = fixture.probes.filter(p => !p.skipDev);
    await waitForDevReady(dev, origin, firstProbePath(probes));
    await runProbes(probes, origin);
  } finally {
    try {
      await dev.kill();
    } catch (err) {
      // killing an already-exited dev server can fail; don't mask the test
      // error or skip the temp dir cleanup
      console.error(`Failed to kill dev server: ${err}`);
    }
    await fs.remove(dirname(tempDir));
  }
}

/**
 * Register one vitest case per fixture. Fixtures containing a VC_DEV_XFAIL
 * file run with `it.fails`: they are expected to fail against `vc dev`, and
 * the test suite alerts (fails) when one starts passing so the marker can be
 * removed. Pass `groupIndex`/`groupCount` to register only one slice of the
 * fixture list (CI chunks per test file).
 */
export function registerFixtureDevTests(
  fixturesDir: string,
  groupIndex?: number,
  groupCount: number = 3
) {
  let fixtures = collectFixtures(fixturesDir);
  if (groupIndex) {
    fixtures = intoChunks(1, groupCount, fixtures)[groupIndex - 1] ?? [];
  }
  for (const f of fixtures) {
    if (f.xfail !== null) {
      const reason = f.xfail ? `: ${f.xfail}` : '';
      it.fails(`[vc dev] e2e fixture ${f.name} (VC_DEV_XFAIL${reason})`, () =>
        runFixtureAgainstDev(f));
    } else {
      it(`[vc dev] e2e fixture ${f.name}`, () => runFixtureAgainstDev(f));
    }
  }
}
