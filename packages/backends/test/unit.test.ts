import {
  BuildResultV2Typical,
  FileBlob,
  NodejsLambda,
} from '@vercel/build-utils';
import { build } from '../src/index';
import { join, resolve } from 'path';
import execa from 'execa';
import { describe, expect, it } from 'vitest';
import { readdir, writeFile, rm, mkdtemp, mkdir } from 'fs/promises';
import { tmpdir } from 'os';

const clearOutputs = async (fixtureName: string) => {
  await rm(join(__dirname, 'fixtures', fixtureName, '.vercel'), {
    recursive: true,
    force: true,
  });
  await rm(join(__dirname, 'fixtures', fixtureName, 'dist'), {
    recursive: true,
    force: true,
  });
  await rm(join(__dirname, 'fixtures', fixtureName, 'node_modules'), {
    recursive: true,
    force: true,
  });
};

const config = {
  outputDirectory: undefined,
  zeroConfig: true,
};
const meta = { skipDownload: true };

describe('successful builds', async () => {
  const fixtures = (await readdir(join(__dirname, 'fixtures'))).filter(
    fixtureName => fixtureName.includes('')
  );
  for (const fixtureName of fixtures) {
    it(`builds ${fixtureName}`, async () => {
      await clearOutputs(fixtureName);
      const workPath = join(__dirname, 'fixtures', fixtureName);

      const result = (await build({
        files: {},
        workPath,
        config,
        meta,
        entrypoint: 'package.json',
        repoRootPath: workPath,
      })) as BuildResultV2Typical;

      const lambda = result.output.index as unknown as NodejsLambda;
      // const lambdaPath = join(__dirname, 'debug');
      const lambdaPath = undefined;

      // Runs without errors
      await expect(
        extractAndExecuteCode(lambda, lambdaPath, fixtureName)
      ).resolves.toBeUndefined();
    }, 10000);
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

    const lambdaPath = join(__dirname, 'debug');
    const lambda = result.output.index as unknown as NodejsLambda;

    await extractAndExecuteCode(lambda, lambdaPath);
  }, 20000);
});

it('extractAndExecuteCode throws with invalid code', async () => {
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
  await expect(
    extractAndExecuteCode(validLambda, undefined, 'valid')
  ).resolves.toBeUndefined();
  await expect(
    extractAndExecuteCode(invalidLambda, undefined, 'invalid')
  ).rejects.toThrow();
});

const extractAndExecuteCode = async (
  lambda: NodejsLambda,
  lambdaDir?: string,
  fixtureName?: string
) => {
  const out = await lambda.createZip();
  const prefix = fixtureName ? `lambda-test-${fixtureName}-` : 'lambda-test-';
  const tempDir = await mkdtemp(join(tmpdir(), prefix));
  if (lambdaDir && lambdaDir !== '') {
    await rm(lambdaDir, { recursive: true, force: true });
    await mkdir(lambdaDir, { recursive: true });
  }
  const lambdaPath = join(lambdaDir || tempDir, 'lambda.zip');
  await writeFile(lambdaPath, out);
  await execa('unzip', ['-o', lambdaPath], {
    cwd: tempDir,
    stdio: 'ignore', // use inherit to debug
  });

  const handlerPath = join(tempDir, lambda.handler);

  // Wrap in a Promise to properly wait for the process to exit
  await new Promise<void>((resolve, reject) => {
    const fakeLambdaProcess = execa('node', [handlerPath], {
      cwd: tempDir,
      stdio: 'ignore', // use inherit to debug
    });

    fakeLambdaProcess.on('error', error => {
      console.error(error);
      reject(error);
    });

    fakeLambdaProcess.on('exit', (code, signal) => {
      if (code !== 0) {
        reject(
          new Error(`Process exited with code ${code} and signal ${signal}`)
        );
      } else {
        resolve();
      }
    });

    // Kill the process after a short delay if it's still running
    setTimeout(() => {
      if (!fakeLambdaProcess.killed) {
        fakeLambdaProcess.kill('SIGTERM');
      }
    }, 1000);
  });
};
