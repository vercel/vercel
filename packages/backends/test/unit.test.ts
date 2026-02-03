import {
  BuildResultV2Typical,
  FileBlob,
  NodejsLambda,
} from '@vercel/build-utils';
import { build } from '../src/index';
import { join, resolve } from 'node:path';
import execa from 'execa';
import { describe, expect, it } from 'vitest';
import {
  readdir,
  readFile,
  writeFile,
  mkdtemp,
  cp,
  rm,
  mkdir,
  realpath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';

const meta = { skipDownload: true };
const defaultConfig = {
  outputDirectory: undefined,
  zeroConfig: true,
  // Always use npm install to avoid pnpm workspace detection in monorepo
  projectSettings: { installCommand: 'npm install' },
};

interface VercelJson {
  rootDirectory?: string;
  installCommand?: string;
  buildCommand?: string;
  outputDirectory?: string;
  framework?: string;
  [key: string]: unknown;
}

const loadVercelJson = async (fixtureSource: string) => {
  const vercelJsonPath = join(fixtureSource, 'vercel.json');
  try {
    const content = await readFile(vercelJsonPath, 'utf-8');
    return JSON.parse(content) as VercelJson;
  } catch {
    return null;
  }
};

const getFixtureConfig = (vercelJson: VercelJson | null) => {
  if (!vercelJson) {
    return defaultConfig;
  }
  const {
    rootDirectory,
    installCommand,
    buildCommand,
    outputDirectory,
    framework,
  } = vercelJson;
  return {
    ...defaultConfig,
    projectSettings: {
      ...defaultConfig.projectSettings,
      ...(rootDirectory && { rootDirectory }),
      ...(installCommand && { installCommand }),
      ...(buildCommand && { buildCommand }),
      ...(outputDirectory && { outputDirectory }),
      ...(framework && { framework }),
    },
  };
};

// Set to true to use packages/backends/debug instead of a temp directory
const USE_DEBUG_DIR = true;
// Uncomment to enable debug logs
process.env.VERCEL_BUILDER_DEBUG = '1';

const DEBUG_DIR = join(__dirname, 'debug');

const getWorkDir = async (fixtureName: string, fixtureSource: string) => {
  // Always copy source to a random tmp dir
  const tempDir = await realpath(
    await mkdtemp(join(tmpdir(), `fixture-${fixtureName}-`))
  );
  await cp(fixtureSource, tempDir, { recursive: true });

  // When USE_DEBUG_DIR is true, lambda output goes to debug/{fixtureName}
  // Otherwise, lambda output goes to the same temp dir
  let lambdaOutputDir = tempDir;
  if (USE_DEBUG_DIR) {
    lambdaOutputDir = join(DEBUG_DIR, fixtureName);
    await rm(lambdaOutputDir, { recursive: true, force: true });
    await mkdir(lambdaOutputDir, { recursive: true });
  }

  return { workDir: tempDir, lambdaOutputDir };
};

describe('successful builds', async () => {
  const fixtures = (await readdir(join(__dirname, 'fixtures'))).filter(
    fixtureName => fixtureName.includes('17')
  );
  for (const fixtureName of fixtures) {
    // Windows is just too slow to build these fixtures
    it.skipIf(process.platform === 'win32').only(
      `builds ${fixtureName}`,
      async () => {
        // Copy entire fixture to work dir so no parent node_modules can interfere
        const fixtureSource = join(__dirname, 'fixtures', fixtureName);
        const vercelJson = await loadVercelJson(fixtureSource);
        const config = getFixtureConfig(vercelJson);

        const { workDir, lambdaOutputDir } = await getWorkDir(
          fixtureName,
          fixtureSource
        );

        const repoRootPath = workDir;
        // If vercel.json specifies rootDirectory, use it as the workPath
        const workPath = vercelJson?.rootDirectory
          ? join(workDir, vercelJson.rootDirectory)
          : workDir;

        const result = (await build({
          files: {},
          workPath,
          config,
          meta,
          entrypoint: 'package.json',
          repoRootPath,
        })) as BuildResultV2Typical;

        const lambda = result.output.index as unknown as NodejsLambda;

        // await expect(
        //   JSON.stringify(result.routes, null, 2)
        // ).toMatchFileSnapshot(join(fixtureSource, 'routes.json'));

        await expect(
          extractAndExecuteLambda(lambda, lambdaOutputDir, USE_DEBUG_DIR)
        ).resolves.toBeUndefined();
      },
      30000
    ); // copying fixture and running npm install so it takes a while
  }

  // eslint-disable-next-line jest/no-disabled-tests
  it.skip(`builds workflow-server`, async () => {
    const workPath = resolve(process.env.HOME!, 'code/workflow-server');

    const result = (await build({
      files: {},
      workPath,
      config: defaultConfig,
      meta,
      entrypoint: 'package.json',
      repoRootPath: workPath,
    })) as BuildResultV2Typical;

    const lambda = result.output.index as unknown as NodejsLambda;
    const tempDir = await mkdtemp(join(tmpdir(), 'workflow-server-'));

    await extractAndExecuteLambda(lambda, tempDir);
  }, 20000);
});

it('extractAndExecuteLambda throws with invalid code', async () => {
  const validLambda = new NodejsLambda({
    runtime: 'nodejs22.x',
    handler: 'index.js',
    files: {
      'index.js': new FileBlob({
        data: 'export default (req, res) => res.end("hi");',
      }),
      'package.json': new FileBlob({ data: '{"type": "module"}' }),
    },
    shouldAddHelpers: false,
    shouldAddSourcemapSupport: true,
    awsLambdaHandler: '',
  });
  // esm/cjs mixture which will fail on node 20
  const invalidLambda = new NodejsLambda({
    runtime: 'nodejs22.x',
    handler: 'index.js',
    files: {
      'index.js': new FileBlob({
        data: 'module.exports = (req, res) => res.end("hi");',
      }),
      'package.json': new FileBlob({ data: '{"type": "module"}' }),
    },
    shouldAddHelpers: false,
    shouldAddSourcemapSupport: true,
    awsLambdaHandler: '',
  });
  const validTempDir = await mkdtemp(join(tmpdir(), 'lambda-test-valid-'));
  const invalidTempDir = await mkdtemp(join(tmpdir(), 'lambda-test-invalid-'));
  await expect(
    extractAndExecuteLambda(validLambda, validTempDir)
  ).resolves.toBeUndefined();
  await expect(
    extractAndExecuteLambda(invalidLambda, invalidTempDir)
  ).rejects.toThrow();
});

const extractAndExecuteLambda = async (
  lambda: NodejsLambda,
  dir: string,
  extractDirectly = false
) => {
  const out = await lambda.createZip();
  const lambdaZipPath = join(dir, 'lambda.zip');
  await writeFile(lambdaZipPath, new Uint8Array(out));

  // When extractDirectly is true, extract to dir directly (for debug output)
  // Otherwise, extract to dir/lambda subfolder
  const unzipPath = extractDirectly ? dir : join(dir, 'lambda');
  await execa('unzip', ['-o', lambdaZipPath, '-d', unzipPath], {
    stdio: 'ignore',
  });

  const handlerPath = join(unzipPath, lambda.handler);

  // Wrap in a Promise to properly wait for the process to exit
  await new Promise<void>((resolve, reject) => {
    const fakeLambdaProcess = execa('node', [handlerPath], {
      cwd: unzipPath,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    let stdout = '';
    fakeLambdaProcess.stderr?.on('data', data => {
      stderr += data.toString();
    });
    fakeLambdaProcess.stdout?.on('data', data => {
      stdout += data.toString();
    });

    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    fakeLambdaProcess.on('error', error => {
      console.error(error);
      settle(() => reject(error));
    });

    fakeLambdaProcess.on('exit', (code, signal) => {
      // Killed by our timeout - success
      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        return settle(() => resolve());
      }
      // Process exited on its own
      if (code !== 0) {
        const output = stderr || stdout || '(no output)';
        return settle(() =>
          reject(
            new Error(
              `Process exited with code ${code} and signal ${signal}\n${output}`
            )
          )
        );
      }
      settle(() => resolve());
    });

    // Kill the process after a short delay if it's still running
    setTimeout(() => {
      if (!fakeLambdaProcess.killed) {
        fakeLambdaProcess.kill('SIGTERM');
      }
    }, 1000);
    // Force kill if SIGTERM didn't work
    setTimeout(() => {
      if (!fakeLambdaProcess.killed) {
        fakeLambdaProcess.kill('SIGKILL');
      }
    }, 1500);
    // Force resolve after timeout even if exit event hasn't fired
    setTimeout(() => {
      settle(() => resolve());
    }, 2000);
  });
};
