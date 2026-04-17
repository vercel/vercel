import { join } from 'path';
import { mkdirp, outputJSON, writeFile, remove, realpath } from 'fs-extra';
import { tmpdir } from 'os';
import { mkdtemp } from 'fs/promises';
import execa from 'execa';

const REPO_ROOT = join(__dirname, '../../../../..');
const CLI_START = join(REPO_ROOT, 'packages/cli/scripts/start.js');

interface IsolatedProject {
  dir: string;
  cleanup: () => Promise<void>;
}

/**
 * Creates an isolated project directory in the OS temp directory.
 * This ensures require() won't crawl up to the repo's node_modules.
 *
 * Sets up a minimal project structure:
 * - .vercel/project.json (required for `vc build`)
 * - index.html (a simple static file so @vercel/static can build it)
 */
export async function createIsolatedProject(): Promise<IsolatedProject> {
  // Use realpath to resolve symlinks (e.g. macOS /var -> /private/var)
  const raw = await mkdtemp(join(tmpdir(), 'vc-e2e-builders-'));
  const dir = await realpath(raw);

  // Minimal project config
  await mkdirp(join(dir, '.vercel'));
  await outputJSON(join(dir, '.vercel', 'project.json'), {
    orgId: '.',
    projectId: '.',
    settings: {
      framework: null,
    },
  });

  // A simple static file so @vercel/static has something to build
  await writeFile(join(dir, 'index.html'), '<h1>test</h1>\n');

  return {
    dir,
    cleanup: () => remove(dir),
  };
}

interface PlaceBuilderOptions {
  /** The builder package name, e.g. "@vercel/node" */
  name: string;
  /** The version string to put in package.json */
  version: string;
  /**
   * The directory under which to create node_modules/<name>/.
   * For peer deps: the project dir itself.
   * For .vercel/builders cache: <projectDir>/.vercel/builders
   */
  baseDir: string;
}

/**
 * Places a minimal fake builder at a given node_modules location.
 * The builder exports `{ version: 3, build }` — enough for `vc build`
 * to consider it valid.
 */
export async function placeBuilder({
  name,
  version,
  baseDir,
}: PlaceBuilderOptions): Promise<string> {
  const builderDir = join(baseDir, 'node_modules', name);
  await mkdirp(builderDir);

  await outputJSON(join(builderDir, 'package.json'), {
    name,
    version,
    main: 'index.js',
  });

  // Minimal builder that satisfies the Builder interface
  await writeFile(
    join(builderDir, 'index.js'),
    `
exports.version = 3;
exports.build = async function build({ entrypoint, files, config }) {
  return { output: {} };
};
`.trim()
  );

  return builderDir;
}

interface RunVercelBuildOptions {
  cwd: string;
  env?: Record<string, string>;
}

interface RunVercelBuildResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Combined stdout + stderr for easier grep */
  combined: string;
}

/**
 * Runs `node <repo>/packages/cli/scripts/start.js build --debug`
 * from the given cwd. Uses --debug so we can inspect resolution logs.
 *
 * The --token and --scope flags are set to dummy values since
 * `vc build` doesn't need real API credentials.
 */
export async function runVercelBuild(
  opts: RunVercelBuildOptions
): Promise<RunVercelBuildResult> {
  const result = await execa(
    process.execPath,
    [CLI_START, 'build', '--debug', '--yes'],
    {
      cwd: opts.cwd,
      reject: false,
      env: {
        // Start with a clean env — don't inherit VERCEL_TOKEN, etc.
        // that could interfere with the test
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_PATH: process.env.NODE_PATH,
        ...opts.env,
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        NO_UPDATE_NOTIFIER: '1',
      },
    }
  );

  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    combined: result.stdout + '\n' + result.stderr,
  };
}
