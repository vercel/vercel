import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import execa from 'execa';
import { FileFsRef, NodejsLambda } from '@vercel/build-utils';
import build from '../../../../src/commands/build';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

vi.setConfig({ testTimeout: 6 * 60 * 1000 });

/**
 * Recursively add all files from a directory to the files map.
 */
async function addDirFilesRecursively(
  files: Record<string, FileFsRef>,
  dir: string,
  prefix: string
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    const entryZipPath = prefix ? join(prefix, entry.name) : entry.name;
    if (entry.isFile()) {
      files[entryZipPath] = new FileFsRef({ fsPath: entryPath });
    } else if (entry.isDirectory()) {
      await addDirFilesRecursively(files, entryPath, entryZipPath);
    } else if (entry.isSymbolicLink()) {
      // Follow symlinks
      const realPath = await fs.realpath(entryPath);
      const realStat = await fs.stat(realPath);
      if (realStat.isFile()) {
        files[entryZipPath] = new FileFsRef({ fsPath: realPath });
      } else if (realStat.isDirectory()) {
        await addDirFilesRecursively(files, realPath, entryZipPath);
      }
    }
  }
}

/**
 * Create a NodejsLambda from a .func directory in the build output.
 * This reads the .vc-config.json and collects all the files to create
 * a lambda that can be zipped and executed.
 */
async function createLambdaFromFuncDir(
  funcDir: string,
  workPath: string // The monorepo root where the build was run
): Promise<NodejsLambda> {
  const vcConfig = await fs.readJSON(join(funcDir, '.vc-config.json'));
  const { handler, runtime, filePathMap } = vcConfig;

  if (!runtime?.startsWith('nodejs')) {
    throw new Error(`Unsupported runtime: ${runtime}`);
  }

  const files: Record<string, FileFsRef> = {};

  // 1. Add all files from the .func directory itself (except .vc-config.json)
  // This includes any node_modules, source files, etc. that were placed directly in the func dir
  const funcEntries = await fs.readdir(funcDir, { withFileTypes: true });
  for (const entry of funcEntries) {
    if (entry.name === '.vc-config.json') continue;
    const entryPath = join(funcDir, entry.name);
    if (entry.isFile()) {
      files[entry.name] = new FileFsRef({ fsPath: entryPath });
    } else if (entry.isDirectory()) {
      await addDirFilesRecursively(files, entryPath, entry.name);
    } else if (entry.isSymbolicLink()) {
      const realPath = await fs.realpath(entryPath);
      const realStat = await fs.stat(realPath);
      if (realStat.isFile()) {
        files[entry.name] = new FileFsRef({ fsPath: realPath });
      } else if (realStat.isDirectory()) {
        await addDirFilesRecursively(files, realPath, entry.name);
      }
    }
  }

  // 2. Add files from filePathMap (these reference files elsewhere in the workPath)
  if (filePathMap) {
    for (const [zipPath, outputPath] of Object.entries(filePathMap)) {
      // Skip if already added from func directory
      if (files[zipPath]) continue;

      const fsPath = join(workPath, outputPath as string);
      const stat = await fs.stat(fsPath).catch(() => null);
      if (stat?.isFile()) {
        files[zipPath] = new FileFsRef({ fsPath });
      } else if (stat?.isDirectory()) {
        await addDirFilesRecursively(files, fsPath, zipPath);
      }
    }
  }

  // 3. Ensure the handler file is included (it might not be in filePathMap)
  if (!files[handler]) {
    const handlerFsPath = join(workPath, handler);
    if (await fs.pathExists(handlerFsPath)) {
      files[handler] = new FileFsRef({ fsPath: handlerFsPath });
    }
  }

  return new NodejsLambda({
    files,
    handler,
    runtime,
    shouldAddHelpers: false,
    shouldAddSourcemapSupport: false,
  });
}

/**
 * Extract and execute code from a NodejsLambda to verify it runs without errors.
 * Based on the logic from @vercel/backends test suite.
 *
 * @param lambda The NodejsLambda to execute
 * @param expectedMarker A string that should appear in stdout to verify the function executed correctly
 */
async function extractAndExecuteCode(
  lambda: NodejsLambda,
  expectedMarker: string
): Promise<void> {
  const out = await lambda.createZip();
  const tempDir = await mkdtemp(join(tmpdir(), 'lambda-test-'));

  const lambdaPath = join(tempDir, 'lambda.zip');
  await writeFile(lambdaPath, new Uint8Array(out));
  await execa('unzip', ['-o', lambdaPath], {
    cwd: tempDir,
    stdio: 'ignore',
  });

  const handlerPath = join(tempDir, lambda.handler);

  // Wrap in a Promise to properly wait for the process to exit
  const { stdout, stderr } = await new Promise<{
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    const fakeLambdaProcess = execa('node', [handlerPath], {
      cwd: tempDir,
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

    fakeLambdaProcess.on('error', error => {
      // eslint-disable-next-line no-console
      console.error(error);
      reject(error);
    });

    fakeLambdaProcess.on('exit', (code, signal) => {
      if (signal === 'SIGTERM') {
        resolve({ stdout, stderr });
      } else if (code !== 0) {
        const output = stderr || stdout || '(no output)';
        reject(
          new Error(
            `Process exited with code ${code} and signal ${signal}\n${output}`
          )
        );
      } else {
        resolve({ stdout, stderr });
      }
    });

    // Kill the process after a short delay if it's still running
    setTimeout(() => {
      if (!fakeLambdaProcess.killed) {
        fakeLambdaProcess.kill('SIGTERM');
      }
    }, 1000);
  });

  // Verify the expected marker was output
  const allOutput = stdout + stderr;
  if (!allOutput.includes(expectedMarker)) {
    throw new Error(
      `Expected marker "${expectedMarker}" not found in output:\n${allOutput || '(no output)'}`
    );
  }

  // Clean up
  await rm(tempDir, { recursive: true, force: true });
}

describe('monorepo builds with VERCEL_BUILD_MONOREPO_SUPPORT', () => {
  beforeEach(() => {
    delete process.env.__VERCEL_BUILD_RUNNING;
    delete process.env.VERCEL_TRACING_DISABLE_AUTOMATIC_FETCH_INSTRUMENTATION;
  });

  afterEach(() => {
    delete process.env.VERCEL_BUILD_MONOREPO_SUPPORT;
    delete process.env.VERCEL_EXPERIMENTAL_BACKENDS;
  });

  it.skipIf(process.platform === 'win32')(
    'should build turborepo with hono and workspace dependencies',
    async () => {
      // Copy fixture to temp directory to avoid parent package.json/node_modules interference
      const cwd = setupUnitFixture('commands/build/turborepo-hono-monorepo');
      // Output is in the monorepo root .vercel/output since we run from root with rootDirectory
      const output = join(cwd, '.vercel/output');

      // Remove echo dist if it exists from fixture - we want turbo to build it
      const echoDistPath = join(cwd, 'packages/echo/dist');
      await fs.remove(echoDistPath);

      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_turborepo_hono',
        name: 'turborepo-hono-api',
        framework: 'hono',
        rootDirectory: 'apps/api',
      });

      // Enable monorepo support and experimental backends
      process.env.VERCEL_BUILD_MONOREPO_SUPPORT = '1';
      // process.env.VERCEL_EXPERIMENTAL_BACKENDS = '1';

      // Set cwd to monorepo root - rootDirectory handles the subdirectory
      client.cwd = cwd;
      client.setArgv('build', '--yes');
      const exitCode = await build(client);

      expect(exitCode).toEqual(0);

      // Verify the build output exists
      const outputExists = await fs.pathExists(output);
      expect(outputExists).toBe(true);

      // Check that functions were created
      const functionsDir = join(output, 'functions');
      const functionsExist = await fs.pathExists(functionsDir);
      expect(functionsExist).toBe(true);

      // Check builds.json
      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds.builds).toBeDefined();
      expect(builds.builds.length).toBeGreaterThan(0);

      // Check if @vercel/hono was used (which means experimental backends should have been used)
      const honoBuilder = builds.builds.find(
        (b: any) => b.use === '@vercel/hono'
      );
      // For now, just verify the build succeeded with hono
      expect(honoBuilder).toBeDefined();

      // Verify that turbo built the echo package (its dist should now exist)
      const echoDistAfter = await fs.pathExists(echoDistPath);
      expect(echoDistAfter).toBe(true);

      // Create a lambda from the built .func directory and execute it
      const indexFuncDir = join(functionsDir, 'index.func');
      const indexFuncExists = await fs.pathExists(indexFuncDir);
      expect(indexFuncExists).toBe(true);

      // Create a NodejsLambda from the .func output and execute it
      // Pass the monorepo root (cwd) since filePathMap paths are relative to workPath
      const lambda = await createLambdaFromFuncDir(indexFuncDir, cwd);

      // Execute the lambda and verify it outputs the expected marker
      await expect(
        extractAndExecuteCode(
          lambda,
          'VERCEL_TEST_MARKER:turborepo-hono-monorepo'
        )
      ).resolves.toBeUndefined();
    }
  );
});
