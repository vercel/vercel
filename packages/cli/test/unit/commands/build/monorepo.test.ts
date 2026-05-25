import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { createServer, type Server } from 'http';
import { pathToFileURL } from 'url';
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

async function invokeBundledRoute(
  lambda: NodejsLambda,
  request: {
    path: string;
    matchedPath: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
): Promise<{ status: number; body: string }> {
  const out = await lambda.createZip();
  const tempDir = await mkdtemp(join(tmpdir(), 'lambda-route-test-'));

  const lambdaPath = join(tempDir, 'lambda.zip');
  await writeFile(lambdaPath, new Uint8Array(out));
  await execa('unzip', ['-o', lambdaPath], {
    cwd: tempDir,
    stdio: 'ignore',
  });

  const handlerPath = join(tempDir, lambda.handler);
  const originalCwd = process.cwd();
  let server: Server | undefined;

  try {
    process.chdir(tempDir);

    const handlerModule = await import(pathToFileURL(handlerPath).href);
    const handler = handlerModule.default ?? handlerModule;
    if (typeof handler !== 'function') {
      throw new Error(
        `Expected ${lambda.handler} to export a function handler`
      );
    }

    server = createServer(async (req, res) => {
      try {
        await handler(req, res);
      } catch (error: any) {
        res.statusCode = 500;
        res.end(error.message);
      }
    });

    await new Promise<void>(resolve => {
      server!.listen(0, '127.0.0.1', resolve);
    });

    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Expected server to listen on an object address');
    }

    const response = await fetch(
      `http://127.0.0.1:${addr.port}${request.path}`,
      {
        method: request.method ?? 'GET',
        headers: {
          'x-matched-path': request.matchedPath,
          ...request.headers,
        },
        body: request.body,
      }
    );

    return {
      status: response.status,
      body: await response.text(),
    };
  } finally {
    process.chdir(originalCwd);
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server!.close(err => (err ? reject(err) : resolve()))
      );
    }
    await rm(tempDir, { recursive: true, force: true });
  }
}

describe('monorepo builds with VERCEL_BUILD_MONOREPO_SUPPORT', () => {
  beforeEach(() => {
    delete process.env.__VERCEL_BUILD_RUNNING;
    delete process.env.VERCEL_TRACING_DISABLE_AUTOMATIC_FETCH_INSTRUMENTATION;
  });

  afterEach(() => {
    delete process.env.VERCEL_BUILD_MONOREPO_SUPPORT;
    delete process.env.VERCEL_API_FUNCTION_BUNDLING;
    delete process.env.VERCEL_EXPERIMENTAL_BACKENDS;
    delete process.env.TURBO_FORCE;
  });

  it.skipIf(process.platform === 'win32')(
    'should build workflow-style bundled node api routes from a rootDirectory',
    async () => {
      const rootDirectory = 'workbench/example';
      const cwd = setupUnitFixture(
        'commands/build/workflow-root-directory-bundling'
      );
      const output = join(cwd, '.vercel/output');

      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_workflow_example',
        name: 'workflow-example',
        framework: null,
        rootDirectory,
      });

      process.env.VERCEL_BUILD_MONOREPO_SUPPORT = '1';
      process.env.VERCEL_API_FUNCTION_BUNDLING = '1';

      client.cwd = cwd;
      client.setArgv('build', '--yes');
      const exitCode = await build(client);

      expect(exitCode).toEqual(0);

      const funcDir = join(
        output,
        'functions',
        'api',
        'test-direct-step-call.func'
      );
      expect(await fs.pathExists(funcDir)).toBe(true);

      const lambda = await createLambdaFromFuncDir(funcDir, cwd);

      expect(lambda.handler).toEqual('___vc_bundled_api_handler.js');
      expect(lambda.files?.['___vc_bundled_api_config.json']).toBeUndefined();
      expect(
        lambda.files?.[
          join('workbench', 'example', 'api', 'test-direct-step-call.js')
        ]
      ).toBeDefined();

      const response = await invokeBundledRoute(lambda, {
        path: '/api/test-direct-step-call',
        matchedPath: '/api/test-direct-step-call',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ x: 2, y: 3 }),
      });

      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ result: 5 });
    }
  );

  it.skipIf(process.platform === 'win32')(
    'should build workflow-style unbundled node api routes from a rootDirectory',
    async () => {
      const rootDirectory = 'workbench/example';
      const cwd = setupUnitFixture(
        'commands/build/workflow-root-directory-bundling'
      );
      const output = join(cwd, '.vercel/output');

      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_workflow_example',
        name: 'workflow-example',
        framework: null,
        rootDirectory,
      });

      process.env.VERCEL_BUILD_MONOREPO_SUPPORT = '1';
      // Explicitly do NOT set VERCEL_API_FUNCTION_BUNDLING

      client.cwd = cwd;
      client.setArgv('build', '--yes');
      const exitCode = await build(client);

      expect(exitCode).toEqual(0);

      const funcDir = join(
        output,
        'functions',
        'api',
        'test-direct-step-call.func'
      );
      expect(await fs.pathExists(funcDir)).toBe(true);

      const lambda = await createLambdaFromFuncDir(funcDir, cwd);

      // Without bundling, the handler should be the raw entrypoint path
      expect(lambda.handler).toEqual(
        join('workbench', 'example', 'api', 'test-direct-step-call.js')
      );
      expect(lambda.files?.['___vc_bundled_api_handler.js']).toBeUndefined();
      expect(lambda.files?.['___vc_bundled_api_config.json']).toBeUndefined();
      expect(
        lambda.files?.[
          join('workbench', 'example', 'api', 'test-direct-step-call.js')
        ]
      ).toBeDefined();
    }
  );

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
      process.env.TURBO_FORCE = '1'; // Force execution, ignore cache
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

      const config = await fs.readJSON(join(output, 'config.json'));
      expect(config.routes.find((r: any) => r.dest === '/echo')).toBeDefined();

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
