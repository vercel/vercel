import {
  BuildResultV2Typical,
  FileBlob,
  NodejsLambda,
} from '@vercel/build-utils';
import { build } from '../src/index';
import { join, resolve } from 'path';
import execa from 'execa';
import { describe, expect, it } from 'vitest';
import {
  readdir,
  writeFile,
  mkdtemp,
  cp,
  rm,
  mkdir,
  realpath,
} from 'fs/promises';
import { tmpdir } from 'os';

const config = {
  outputDirectory: undefined,
  zeroConfig: true,
};
const meta = { skipDownload: true };

// Set to true to use packages/backends/debug instead of a temp directory
const USE_DEBUG_DIR = false;
const DEBUG_DIR = join(__dirname, 'debug');

// process.env.VERCEL_BUILD_DEBUG = '1';

const getWorkDir = async (fixtureName: string, fixtureSource: string) => {
  if (USE_DEBUG_DIR) {
    const debugDir = join(DEBUG_DIR, fixtureName);
    await rm(debugDir, { recursive: true, force: true });
    await mkdir(debugDir, { recursive: true });
    await cp(fixtureSource, debugDir, { recursive: true });
    return debugDir;
  }
  // Use realpath to resolve macOS /var -> /private/var symlink
  const tempDir = await realpath(
    await mkdtemp(join(tmpdir(), `fixture-${fixtureName}-`))
  );
  await cp(fixtureSource, tempDir, { recursive: true });
  return tempDir;
};

describe('successful builds', async () => {
  const fixtures = (await readdir(join(__dirname, 'fixtures'))).filter(
    // 07
    fixtureName => fixtureName.includes('')
  );
  for (const fixtureName of fixtures) {
    it.only(`builds ${fixtureName}`, async () => {
      // Copy entire fixture to work dir so no parent node_modules can interfere
      const fixtureSource = join(__dirname, 'fixtures', fixtureName);
      const workDir = await getWorkDir(fixtureName, fixtureSource);

      const workPath = workDir;
      const repoRootPath = workDir;

      const result = (await build({
        files: {},
        workPath,
        config,
        meta,
        entrypoint: 'package.json',
        repoRootPath,
      })) as BuildResultV2Typical;

      const lambda = result.output.index as unknown as NodejsLambda;

      // Extract and execute lambda in the same work directory
      await expect(
        extractAndExecuteLambda(lambda, workDir)
      ).resolves.toBeUndefined();
    }, 20000);
  }

  // eslint-disable-next-line jest/no-disabled-tests
  it.skip(`builds workflow-server`, async () => {
    const workPath = resolve(process.env.HOME!, 'code/workflow-server');

    const result = (await build({
      files: {},
      workPath,
      config,
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

const extractAndExecuteLambda = async (lambda: NodejsLambda, dir: string) => {
  const out = await lambda.createZip();
  const lambdaZipPath = join(dir, 'lambda.zip');
  await writeFile(lambdaZipPath, new Uint8Array(out));

  const unzipPath = join(dir, 'lambda');
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
