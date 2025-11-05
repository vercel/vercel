import {
  BuildResultV2Typical,
  FileBlob,
  FileFsRef,
  Files,
  NodejsLambda,
} from '@vercel/build-utils';
import { build } from '../dist';
import { join } from 'path';
import execa from 'execa';
import { describe, expect, it } from 'vitest';
import { readdir, writeFile, rm, stat, mkdtemp } from 'fs/promises';
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
  framework: 'express-experimental',
  projectSettings: {
    createdAt: 1752690985471,
    framework: 'express-experimental',
    devCommand: null,
    installCommand: null,
    buildCommand: null,
    outputDirectory: null,
    rootDirectory: null,
    directoryListing: false,
    nodeVersion: '22.x',
  },
  nodeVersion: '22.x',
};
const meta = { skipDownload: true };

const createFiles = (workPath: string, fileList: string[]) => {
  const files: Files = {};

  for (const path of fileList) {
    if (!path) {
      console.log('❌ createFiles - Found undefined/null path!');
      continue;
    }

    const fullPath = join(workPath, path);

    files[path] = new FileFsRef({
      fsPath: fullPath,
      mode: 0o644,
    });
  }
  return files;
};

const readDirectoryRecursively = async (
  dirPath: string,
  basePath = ''
): Promise<string[]> => {
  const files: string[] = [];
  const items = await readdir(dirPath);

  for (const item of items) {
    const fullPath = join(dirPath, item);
    const relativePath = basePath ? join(basePath, item) : item;

    if ((await stat(fullPath)).isDirectory()) {
      files.push(...(await readDirectoryRecursively(fullPath, relativePath)));
    } else {
      files.push(relativePath);
    }
  }

  return files;
};

describe('successful builds', async () => {
  const fixtures = (await readdir(join(__dirname, 'fixtures'))).filter(
    fixtureName => fixtureName.includes('07')
  );
  for (const fixtureName of fixtures) {
    it(`builds ${fixtureName}`, async () => {
      await clearOutputs(fixtureName);
      const workPath = join(__dirname, 'fixtures', fixtureName);

      const fileList = await readDirectoryRecursively(workPath);

      const files = createFiles(workPath, fileList);
      const result = (await build({
        files,
        workPath,
        config,
        meta,
        entrypoint: 'package.json',
        repoRootPath: workPath,
      })) as BuildResultV2Typical;

      const lambda = result.output.index as unknown as NodejsLambda;

      // Runs without errors
      await expect(extractAndExecuteCode(lambda)).resolves.toBeUndefined();
    });
  }
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
  await expect(extractAndExecuteCode(validLambda)).resolves.toBeUndefined();
  await expect(extractAndExecuteCode(invalidLambda)).rejects.toThrow();
});

const extractAndExecuteCode = async (lambda: NodejsLambda) => {
  const out = await lambda.createZip();
  const tempDir = await mkdtemp(join(tmpdir(), 'lambda-test-'));
  await writeFile(join(tempDir, 'lambda.zip'), out);
  await execa('unzip', ['-o', 'lambda.zip'], {
    cwd: tempDir,
    stdio: 'ignore',
  });

  const handlerPath = join(tempDir, lambda.handler);

  // Wrap in a Promise to properly wait for the process to exit
  await new Promise<void>((resolve, reject) => {
    const fakeLambdaProcess = execa('node', [handlerPath], {
      cwd: tempDir,
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
