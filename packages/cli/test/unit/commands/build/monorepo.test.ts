import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import { dirname, join, resolve, sep } from 'path';
import { tmpdir } from 'os';
import { lstatSync, readdirSync, readlinkSync } from 'fs';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { createServer, type Server } from 'http';
import { pathToFileURL } from 'url';
import execa from 'execa';
import { FileFsRef, NodejsLambda, download, glob } from '@vercel/build-utils';
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
 * Verify a bare module specifier resolves from inside a built `.func`
 * directory the way it would on a deployed Lambda.
 *
 * The traced dependency bytes being present is not sufficient: Node resolves
 * bare imports (e.g. `require('hono')`) by walking up `node_modules`
 * directories from the importing file. Package managers like pnpm provide that
 * link via a relative symlink (e.g. `node_modules/<pkg>` ->
 * `../../node_modules/.pnpm/.../node_modules/<pkg>`). If that symlink is
 * dropped or points outside the function, resolution fails at runtime
 * (`Cannot find module '<pkg>'`) even though the bytes were packaged.
 *
 * The function is reconstructed exactly like the deploy pipeline does (glob the
 * `.func` dir + hydrate `filePathMap` into real `FileFsRef`s), then
 * materialized via `download` (which writes the symlinks) into an ISOLATED
 * location outside the monorepo so there is no parent `node_modules` to mask
 * the failure. A probe script written inside the copy resolves the specifier
 * with an empty `NODE_PATH` — mirroring `/var/task` on the deployed Lambda.
 *
 * @param funcDir absolute path to the built `*.func` directory
 * @param workPath the build cwd used to hydrate `filePathMap` values
 * @param fromRelDir func-relative dir to resolve from (the handler's dir)
 * @param specifier the bare module specifier to resolve (e.g. `hono`)
 */
async function expectModuleResolvesInIsolatedFunc(
  funcDir: string,
  workPath: string,
  fromRelDir: string,
  specifier: string
): Promise<void> {
  const lambda = await createLambdaFromFuncDir(funcDir, workPath);
  const isolatedRoot = await mkdtemp(join(tmpdir(), 'isolated-func-'));
  const isolated = join(isolatedRoot, 'task');
  await fs.mkdirp(isolated);
  await download(lambda.files ?? {}, isolated);
  const probeDir = join(isolated, fromRelDir);
  await fs.mkdirp(probeDir);
  const probe = join(probeDir, '__resolve-probe.cjs');
  await writeFile(probe, `require.resolve(${JSON.stringify(specifier)});`);
  await expect(
    execa('node', [probe], {
      cwd: isolated,
      env: { ...process.env, NODE_PATH: '' },
    }),
    `expected "${specifier}" to resolve from ${fromRelDir} inside the isolated function`
  ).resolves.toMatchObject({ exitCode: 0 });
}

function findSymlinks(dir: string): string[] {
  const symlinks: string[] = [];

  function walk(current: string) {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(current, entry);
      let stat;
      try {
        stat = lstatSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isSymbolicLink()) {
        symlinks.push(fullPath);
      } else if (stat.isDirectory()) {
        walk(fullPath);
      }
    }
  }

  walk(dir);
  return symlinks;
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

  it.skipIf(process.platform === 'win32')(
    'should build a pnpm nextjs monorepo with --standalone for prebuilt deploy',
    async () => {
      const rootDirectory = 'apps/web';
      const cwd = setupUnitFixture('commands/build/turborepo-nextjs-monorepo');
      const output = join(cwd, '.vercel/output');

      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_turborepo_nextjs',
        name: 'turborepo-nextjs-web',
        framework: 'nextjs',
        rootDirectory,
      });

      process.env.VERCEL_BUILD_MONOREPO_SUPPORT = '1';

      client.cwd = cwd;
      client.setArgv('build', '--standalone', '--yes');
      const exitCode = await build(client);

      expect(exitCode).toEqual(0);
      expect(await fs.pathExists(output)).toBe(true);

      const markerFuncDir = join(output, 'functions', 'api', 'marker.func');
      expect(await fs.pathExists(markerFuncDir)).toBe(true);

      // Standalone functions are self-contained: files (including
      // package-manager symlinks) are written directly into the `.func`
      // directory with no `filePathMap`/shared-dir indirection.
      const vcConfig = await fs.readJSON(
        join(markerFuncDir, '.vc-config.json')
      );
      expect(vcConfig.filePathMap ?? {}).toEqual({});

      // No symlink inside the function may resolve outside of it. Relative
      // `../` targets are fine (pnpm store links) as long as they stay within
      // the `.func` directory.
      for (const symlinkPath of findSymlinks(markerFuncDir)) {
        const target = readlinkSync(symlinkPath);
        const resolved = resolve(dirname(symlinkPath), target);
        expect(
          resolved.startsWith(markerFuncDir + sep),
          `symlink resolves outside the function: ${symlinkPath} -> ${target}`
        ).toBe(true);
      }

      const lambda = await createLambdaFromFuncDir(markerFuncDir, cwd);
      await expect(lambda.createZip()).resolves.toBeInstanceOf(Buffer);
    }
  );
});

// Building a project from a monorepo subdirectory. When `vc build` runs from
// a subdirectory (e.g. `--cwd apps/api`), the build re-anchors to the true
// repository root so builders trace relative to it instead of the
// subdirectory. This fixes a
// family of monorepo bugs that share one root cause (the build treating the
// subdirectory as the repository root):
//
//   * `--standalone`: package-manager symlinks are preserved (rather than
//     skipped) so bare imports resolve at runtime, and traced dependency keys
//     no longer escape the function root (`../../node_modules/...`).
//   * non-standalone: builders receive the correct root, so Next.js sets a
//     valid `outputFileTracingRoot`/`turbopack.root` and `.nft.json` traces
//     include hoisted dependencies (otherwise `Cannot find module` at
//     runtime, and Turbopack errors outright).
//
// These tests verify the SAME outcome across frameworks (Hono via
// `@vercel/node`, Next.js via `@vercel/next`), to prove the fix is general
// rather than standalone-specific. Each asserts the dependency resolves from
// an isolated copy of the function — the failure customers reported
// (`Cannot find module`).
describe('standalone builds from a subdirectory', () => {
  beforeEach(() => {
    delete process.env.__VERCEL_BUILD_RUNNING;
    delete process.env.VERCEL_TRACING_DISABLE_AUTOMATIC_FETCH_INSTRUMENTATION;
  });

  afterEach(() => {
    delete process.env.VERCEL_BUILD_MONOREPO_SUPPORT;
    delete process.env.TURBO_FORCE;
  });

  it.skipIf(process.platform === 'win32')(
    'packages a hono dependency so it resolves at runtime (pnpm symlink preserved)',
    async () => {
      const monorepoRoot = setupUnitFixture(
        'commands/build/turborepo-hono-standalone'
      );
      const appDir = join(monorepoRoot, 'apps', 'api');
      const output = join(appDir, '.vercel/output');

      await execa('git', ['init'], { cwd: monorepoRoot });
      await execa('pnpm', ['install', '--ignore-scripts'], {
        cwd: monorepoRoot,
      });

      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_turborepo_hono_standalone',
        name: 'turborepo-hono-standalone',
        framework: 'hono',
        rootDirectory: null,
      });

      client.cwd = appDir;
      client.setArgv('build', '--standalone', '--yes');
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const indexFuncDir = join(output, 'functions', 'index.func');
      expect(await fs.pathExists(indexFuncDir)).toBe(true);

      // The dependency bytes are packaged directly in the function...
      const honoFiles = await glob(
        'node_modules/.pnpm/**/node_modules/hono/**',
        { cwd: indexFuncDir }
      );
      expect(Object.keys(honoFiles).length).toBeGreaterThan(0);

      // ...with no `filePathMap` indirection (everything is self-contained).
      const vcConfig = await fs.readJSON(join(indexFuncDir, '.vc-config.json'));
      expect(vcConfig.filePathMap ?? {}).toEqual({});

      // ...and the dependency resolves at runtime via the preserved symlink.
      await expectModuleResolvesInIsolatedFunc(
        indexFuncDir,
        monorepoRoot,
        'apps/api/src',
        'hono'
      );
    }
  );

  it.skipIf(process.platform === 'win32')(
    'packages a next.js dependency so it resolves at runtime (pnpm symlink preserved)',
    async () => {
      const monorepoRoot = setupUnitFixture(
        'commands/build/turborepo-next-standalone'
      );
      const appDir = join(monorepoRoot, 'apps', 'web');
      const output = join(appDir, '.vercel/output');

      await execa('git', ['init'], { cwd: monorepoRoot });

      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_turborepo_next_standalone',
        name: 'turborepo-next-standalone',
        framework: 'nextjs',
        rootDirectory: null,
      });

      process.env.VERCEL_BUILD_MONOREPO_SUPPORT = '1';
      process.env.TURBO_FORCE = '1';

      client.cwd = appDir;
      client.setArgv('build', '--standalone', '--yes');
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const indexFuncDir = join(output, 'functions', 'index.func');
      expect(await fs.pathExists(indexFuncDir)).toBe(true);

      // No traced key should escape the function root — with the monorepo root
      // as the trace base, dependency keys are anchored (`node_modules/...`).
      const vcConfig = await fs.readJSON(join(indexFuncDir, '.vc-config.json'));
      const escapingKeys = Object.keys(vcConfig.filePathMap ?? {}).filter(key =>
        key.split('/').includes('..')
      );
      expect(escapingKeys).toEqual([]);

      // The Next launcher (`apps/web/___next_launcher.cjs`) loads the compiled
      // server via the pnpm symlink (`apps/web/node_modules/next` ->
      // `../../node_modules/.pnpm/.../next`). Resolve the exact entry the
      // launcher requires, from the launcher's own directory, in an isolated
      // copy — proving the symlink survives and points inside the function.
      // `Cannot find module 'next/dist/...'` is the customer-reported failure.
      await expectModuleResolvesInIsolatedFunc(
        indexFuncDir,
        appDir,
        'apps/web',
        'next/dist/compiled/next-server/server.runtime.prod.js'
      );

      // The reconstructed Lambda still zips cleanly (no `..` zip entries).
      const lambda = await createLambdaFromFuncDir(indexFuncDir, appDir);
      const zip = await lambda.createZip();
      expect(zip.length).toBeGreaterThan(0);
    }
  );

  // Non-standalone: the same root cause (`repoRootPath` defaulting to the app
  // dir) breaks regular `vc build --cwd <subdir>` too — builders trace from
  // the wrong root, so hoisted dependencies are omitted from the function and
  // fail at runtime (NEXT-4944). With repo-root detection the dependency is
  // traced and resolves. This exercises the fix WITHOUT `--standalone`, so it
  // does not touch the standalone `filePathMap`/symlink path at all — proving
  // the fix is not standalone-specific.
  it.skipIf(process.platform === 'win32')(
    'traces a hono dependency for a non-standalone build from a subdirectory',
    async () => {
      const monorepoRoot = setupUnitFixture(
        'commands/build/turborepo-hono-standalone'
      );
      const appDir = join(monorepoRoot, 'apps', 'api');
      const output = join(appDir, '.vercel/output');

      await execa('git', ['init'], { cwd: monorepoRoot });
      await execa('pnpm', ['install', '--ignore-scripts'], {
        cwd: monorepoRoot,
      });

      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_turborepo_hono_standalone',
        name: 'turborepo-hono-standalone',
        framework: 'hono',
        rootDirectory: null,
      });

      // Note: no `--standalone` flag.
      client.cwd = appDir;
      client.setArgv('build', '--yes');
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const indexFuncDir = join(output, 'functions', 'index.func');
      expect(await fs.pathExists(indexFuncDir)).toBe(true);

      // The traced dependency resolves at runtime from an isolated copy of the
      // function (reconstructed via `filePathMap`, as the deploy pipeline
      // does). Without repo-root detection the dependency is not traced and
      // this fails with `Cannot find module 'hono'`.
      await expectModuleResolvesInIsolatedFunc(
        indexFuncDir,
        monorepoRoot,
        'apps/api/src',
        'hono'
      );
    }
  );
});

// Per-directory link resolution.
//
// A project linked in place (`apps/api/.vercel/project.json`) is anchored by
// the link's physical location. Running `vc build` from there should resolve
// the repository root and express the project as its path relative to that
// root — regardless of whether the `rootDirectory` setting is null (config #3)
// or a redundant restatement of the location (config #4, a common
// misconfiguration). The latter previously produced a broken `apps/api/apps/api`
// path; here it must "just work".
describe('per-directory link resolution', () => {
  beforeEach(() => {
    delete process.env.__VERCEL_BUILD_RUNNING;
    delete process.env.VERCEL_TRACING_DISABLE_AUTOMATIC_FETCH_INSTRUMENTATION;
  });

  async function setupApiFixture(rootDirectorySetting: string | null) {
    const monorepoRoot = setupUnitFixture(
      'commands/build/turborepo-hono-standalone'
    );
    const appDir = join(monorepoRoot, 'apps', 'api');

    await execa('git', ['init'], { cwd: monorepoRoot });
    await execa('pnpm', ['install', '--ignore-scripts'], {
      cwd: monorepoRoot,
    });

    // Write the per-directory link's `project.json` with the desired
    // `rootDirectory` setting (the fixture is a throwaway temp copy).
    const projectJsonPath = join(appDir, '.vercel', 'project.json');
    await writeFile(
      projectJsonPath,
      JSON.stringify({
        projectId: 'prj_turborepo_hono_standalone',
        orgId: 'team_dummy',
        settings: {
          framework: 'hono',
          rootDirectory: rootDirectorySetting,
          nodeVersion: '24.x',
        },
      })
    );

    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'prj_turborepo_hono_standalone',
      name: 'turborepo-hono-standalone',
      framework: 'hono',
      rootDirectory: rootDirectorySetting,
    });

    return { monorepoRoot, appDir };
  }

  it.skipIf(process.platform === 'win32')(
    'builds from a subdirectory with a null rootDirectory (config #3)',
    async () => {
      const { monorepoRoot, appDir } = await setupApiFixture(null);
      const output = join(appDir, '.vercel/output');

      client.cwd = appDir;
      client.setArgv('build', '--yes');
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const indexFuncDir = join(output, 'functions', 'index.func');
      expect(await fs.pathExists(indexFuncDir)).toBe(true);

      const vcConfig = await fs.readJSON(join(indexFuncDir, '.vc-config.json'));
      expect(vcConfig.handler).toEqual('apps/api/src/index.js');

      await expectModuleResolvesInIsolatedFunc(
        indexFuncDir,
        monorepoRoot,
        'apps/api/src',
        'hono'
      );
    }
  );

  // When the first build establishes the link itself (settings pulled
  // mid-build), re-anchoring must happen on that same run — not only the next.
  it.skipIf(process.platform === 'win32')(
    'links and re-anchors on the very first build (link established mid-build)',
    async () => {
      const monorepoRoot = setupUnitFixture(
        'commands/build/turborepo-hono-standalone'
      );
      const appDir = join(monorepoRoot, 'apps', 'api');
      const output = join(appDir, '.vercel/output');

      await execa('git', ['init'], { cwd: monorepoRoot });
      await execa('pnpm', ['install', '--ignore-scripts'], {
        cwd: monorepoRoot,
      });

      // Start unlinked so the build pulls settings and links mid-run.
      await fs.remove(join(appDir, '.vercel'));

      // Northstar single-team: `--yes` no longer guesses among multiple
      // choices, so the team must resolve unambiguously.
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      // Named "api" so link auto-detection matches the directory basename.
      useProject({
        ...defaultProject,
        id: 'api',
        name: 'api',
        framework: 'hono',
        rootDirectory: 'apps/api',
      });

      client.cwd = appDir;
      client.setArgv('build', '--yes');
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const projectJson = await fs.readJSON(
        join(appDir, '.vercel', 'project.json')
      );
      expect(projectJson.projectId).toEqual('api');

      const indexFuncDir = join(output, 'functions', 'index.func');
      expect(await fs.pathExists(indexFuncDir)).toBe(true);
      const vcConfig = await fs.readJSON(join(indexFuncDir, '.vc-config.json'));
      expect(vcConfig.handler).toEqual('apps/api/src/index.js');

      await expectModuleResolvesInIsolatedFunc(
        indexFuncDir,
        monorepoRoot,
        'apps/api/src',
        'hono'
      );
    }
  );

  it.skipIf(process.platform === 'win32')(
    'recovers from a redundant rootDirectory restating the location (config #4)',
    async () => {
      // The common misconfiguration: a link at `apps/api` whose project also
      // has `rootDirectory: "apps/api"`. Applying it would point at a
      // non-existent `apps/api/apps/api` (the old crash), so it's ignored in
      // favor of the link's own location and the build just works.
      const { monorepoRoot, appDir } = await setupApiFixture('apps/api');
      const output = join(appDir, '.vercel/output');

      client.cwd = appDir;
      client.setArgv('build', '--yes');
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const indexFuncDir = join(output, 'functions', 'index.func');
      expect(await fs.pathExists(indexFuncDir)).toBe(true);

      const vcConfig = await fs.readJSON(join(indexFuncDir, '.vc-config.json'));
      expect(vcConfig.handler).toEqual('apps/api/src/index.js');

      await expectModuleResolvesInIsolatedFunc(
        indexFuncDir,
        monorepoRoot,
        'apps/api/src',
        'hono'
      );
    }
  );
});
