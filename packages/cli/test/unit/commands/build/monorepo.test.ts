import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import execa from 'execa';
import { FileFsRef, NodejsLambda, glob } from '@vercel/build-utils';
import build from '../../../../src/commands/build';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

vi.setConfig({ testTimeout: 6 * 60 * 1000 });

/**
 * Hydrate files map by adding FileFsRef entries for each filePathMap entry.
 * Based on the API's hydrateFilesMap function.
 */
async function hydrateFilesMap(
  files: Record<string, FileFsRef>,
  filePathMap: Record<string, string>,
  repoRootPath: string
): Promise<void> {
  for (const [funcPath, projectPath] of Object.entries(filePathMap)) {
    const fsPath = join(repoRootPath, projectPath);
    files[funcPath] = await FileFsRef.fromFsPath({ fsPath });
  }
}

/**
 * Create a NodejsLambda from a .func directory in the build output.
 * Based on the API's deserializeLambda function.
 */
async function createLambdaFromFuncDir(
  funcDir: string,
  workPath: string // The monorepo root where the build was run
): Promise<NodejsLambda> {
  const vcConfig = await fs.readJSON(join(funcDir, '.vc-config.json'));
  const { handler, runtime, filePathMap, ...restConfig } = vcConfig;

  if (!runtime?.startsWith('nodejs')) {
    throw new Error(`Unsupported runtime: ${runtime}`);
  }

  // Use glob to get all files from the .func directory (like the API does)
  const files = await glob('**', { cwd: funcDir, includeDirectories: true });
  delete files['.vc-config.json'];

  // Hydrate files from filePathMap
  if (filePathMap) {
    await hydrateFilesMap(
      files as Record<string, FileFsRef>,
      filePathMap,
      workPath
    );
  }

  return new NodejsLambda({
    ...restConfig,
    files,
    handler,
    runtime,
    shouldAddHelpers: restConfig.shouldAddHelpers ?? false,
    shouldAddSourcemapSupport: restConfig.shouldAddSourcemapSupport ?? false,
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

  it.skipIf(process.platform === 'win32').each([
    { experimentalBackends: true, expectedBuilder: '@vercel/backends' },
    {
      experimentalBackends: true,
      expectedBuilder: '@vercel/backends',
      vercelBuildOverride: true,
    },
    {
      experimentalBackends: true,
      expectedBuilder: '@vercel/backends',
      vercelOutputDirectoryOverride: true,
    },
  ])(
    'should build turborepo with hono (experimentalBackends=$experimentalBackends, vercelBuildOverride=$vercelBuildOverride, vercelOutputDirectoryOverride=$vercelOutputDirectoryOverride)',
    async ({
      experimentalBackends,
      expectedBuilder,
      vercelBuildOverride,
      vercelOutputDirectoryOverride,
    }) => {
      const rootDirectory = 'apps/api';
      // Copy fixture to temp directory to avoid parent package.json/node_modules interference

      const cwd = setupUnitFixture('commands/build/turborepo-hono-monorepo');
      // Output is in the monorepo root .vercel/output since we run from root with rootDirectory
      const output = join(cwd, '.vercel/output');

      if (vercelBuildOverride) {
        await fs.writeFile(
          join(cwd, rootDirectory, 'vercel.json'),
          JSON.stringify(
            {
              buildCommand: 'turbo build',
            },
            null
          )
        );
      }
      if (vercelOutputDirectoryOverride) {
        await fs.writeFile(
          join(cwd, rootDirectory, 'vercel.json'),
          JSON.stringify(
            {
              outputDirectory: 'dist',
            },
            null,
            2
          )
        );
      }

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
        rootDirectory,
      });

      // Enable monorepo support
      process.env.VERCEL_BUILD_MONOREPO_SUPPORT = '1';
      if (experimentalBackends) {
        process.env.VERCEL_EXPERIMENTAL_BACKENDS = '1';
      }

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

      // Check if the expected builder was used
      const builder = builds.builds.find((b: any) => b.use === expectedBuilder);
      expect(builder).toBeDefined();

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

      await expect(
        extractAndExecuteCode(
          lambda,
          'VERCEL_TEST_MARKER:turborepo-hono-monorepo'
        )
      ).resolves.toBeUndefined();
    }
  );
});
