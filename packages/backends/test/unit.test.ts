import {
  BuildResultV2Typical,
  FileBlob,
  NodejsLambda,
} from '@vercel/build-utils';
import { build } from '../src/index';
import { join, resolve } from 'node:path';
import execa from 'execa';
import { describe, expect, it } from 'vitest';
import { pathToRegexp } from 'path-to-regexp';
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
import type { IncomingMessage } from 'node:http';
import { Server as HttpServer } from 'node:http';
import { createServerlessEventHandler } from '../../node/src/serverless-functions/serverless-handler.mts';

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
    functions,
  } = vercelJson;
  return {
    ...defaultConfig,
    // @ts-expect-error - functions is not typed
    ...(functions && { functions }),
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
const USE_DEBUG_DIR = false;
// Uncomment to enable debug logs
process.env.VERCEL_BUILDER_DEBUG = '0';

const DEBUG_DIR = join(__dirname, 'debug');
const SERVICE_ROUTE_PREFIX_PATCH = Symbol.for(
  'vc.service.route-prefix-strip.patch'
);

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
    fixtureName => fixtureName.includes('')
  );
  for (const fixtureName of fixtures) {
    // Windows is just too slow to build these fixtures
    it.skipIf(process.platform === 'win32')(
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

        await expect(
          JSON.stringify(result.routes, null, 2)
        ).toMatchFileSnapshot(join(fixtureSource, 'routes.json'));

        if (lambda.files) {
          // Assert includeFiles: if files.json exists, every listed file must be in the lambda
          try {
            const includeFilesJson = await readFile(
              join(fixtureSource, 'files.json'),
              'utf-8'
            );
            const expectedFiles: string[] = JSON.parse(includeFilesJson);
            const lambdaFileKeys = Object.keys(lambda.files);
            for (const file of expectedFiles) {
              expect(lambdaFileKeys).toContain(file);
            }
          } catch {
            // no files.json — skip include assertion
          }

          // Assert excludeFiles: if excludeFiles.json exists, none of the listed files should be in the lambda
          try {
            const excludeFilesJson = await readFile(
              join(fixtureSource, 'excludeFiles.json'),
              'utf-8'
            );
            const excludedFiles: string[] = JSON.parse(excludeFilesJson);
            const lambdaFileKeys = Object.keys(lambda.files);
            for (const file of excludedFiles) {
              expect(lambdaFileKeys).not.toContain(file);
            }
          } catch {
            // no excludeFiles.json — skip exclude assertion
          }
        }

        await expect(
          extractAndExecuteLambda(lambda, lambdaOutputDir, USE_DEBUG_DIR)
        ).resolves.toBeUndefined();
      },
      30000
    ); // copying fixture and running npm install so it takes a while
  }

  // biome-ignore lint/suspicious/noSkippedTests: temporarily disabled
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

it.skipIf(process.platform === 'win32')(
  'does not crash when a workspace dep cannot be resolved',
  async () => {
    const fixtureName = '17-turborepo-hono-monorepo';
    const fixtureSource = join(__dirname, 'fixtures', fixtureName);
    const { workDir } = await getWorkDir(fixtureName, fixtureSource);

    // Add an unresolvable workspace dep import to server.ts
    const serverPath = join(workDir, 'apps/api/server.ts');
    const serverContent = await readFile(serverPath, 'utf-8');
    await writeFile(
      serverPath,
      `// @ts-expect-error\nimport { MAGIC } from '@repo/unresolvable'\nconsole.log(MAGIC)\n${serverContent}`
    );

    // The workspace dep has no exports/main, so rolldown can't resolve it.
    // Before the fix, this caused: "File .../apps/api/@repo/unresolvable does not exist."
    await expect(
      build({
        files: {},
        workPath: join(workDir, 'apps/api'),
        config: getFixtureConfig(await loadVercelJson(fixtureSource)),
        meta,
        entrypoint: 'package.json',
        repoRootPath: workDir,
      })
    ).resolves.toBeDefined();
  },
  30000
);

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

it('maps service internal function output without leading slash', async () => {
  const fixtureName = '01-express-index-ts-esm';
  const fixtureSource = join(__dirname, 'fixtures', fixtureName);
  const { workDir } = await getWorkDir(fixtureName, fixtureSource);

  const result = (await build({
    files: {},
    workPath: workDir,
    config: {
      ...defaultConfig,
      serviceName: 'js-api',
    },
    meta,
    entrypoint: 'package.json',
    repoRootPath: workDir,
  })) as BuildResultV2Typical;

  const lambda = getServiceLambda(result, 'js-api');
  expect(
    result.routes?.some(route => route.dest === '/_svc/js-api/index')
  ).toBe(true);
  expect(result.output.index).toBeUndefined();
  expect(result.output['_svc/js-api/index']).toBeDefined();
  expect(result.output['/_svc/js-api/index']).toBeUndefined();
  expect(lambda.handler).toBe('index.mjs');
}, 30000);

it('prefixes emitted service route sources with routePrefix', async () => {
  const fixtureName = '01-express-index-ts-esm';
  const fixtureSource = join(__dirname, 'fixtures', fixtureName);
  const { workDir } = await getWorkDir(fixtureName, fixtureSource);

  const result = (await build({
    files: {},
    workPath: workDir,
    config: {
      ...defaultConfig,
      routePrefix: 'api/js',
      serviceName: 'js-api',
    },
    meta,
    entrypoint: 'package.json',
    repoRootPath: workDir,
  })) as BuildResultV2Typical;

  const lambda = getServiceLambda(result, 'js-api');
  expect(result.routes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        src: '^/api/js(?:/(.*))?$',
        dest: '/_svc/js-api/index',
      }),
    ])
  );
  expect(result.output.index).toBeUndefined();
  expect(lambda.handler).toContain('__vc_service_vc_init');
  expect(lambda.environment.VERCEL_SERVICE_ROUTE_PREFIX).toBe('/api/js');
  expect(lambda.environment.VERCEL_SERVICE_ROUTE_PREFIX_STRIP).toBe('1');
}, 30000);

it('does not double-prefix routes already authored with routePrefix', async () => {
  const fixtureName = '04-hono-index-ts-esm';
  const fixtureSource = join(__dirname, 'fixtures', fixtureName);
  const { workDir } = await getWorkDir(fixtureName, fixtureSource);

  const result = (await build({
    files: {},
    workPath: workDir,
    config: {
      ...defaultConfig,
      routePrefix: 'api',
      serviceName: 'hono-api',
    },
    meta,
    entrypoint: 'package.json',
    repoRootPath: workDir,
  })) as BuildResultV2Typical;

  const lambda = getServiceLambda(result, 'hono-api');
  expect(result.routes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        src: pathToRegexp('/api/data').regexp.source,
        dest: '/_svc/hono-api/index',
        methods: ['GET'],
      }),
      expect.objectContaining({
        src: pathToRegexp('/api/user/:id').regexp.source,
        dest: '/_svc/hono-api/index',
        methods: ['GET'],
      }),
      expect.objectContaining({
        src: '^/api(?:/(.*))?$',
        dest: '/_svc/hono-api/index',
      }),
    ])
  );
  expect(result.output.index).toBeUndefined();
  expect(lambda.handler).toContain('__vc_service_vc_init');
}, 30000);

it('does not rewrite non-service route outputs', async () => {
  const fixtureName = '01-express-index-ts-esm';
  const fixtureSource = join(__dirname, 'fixtures', fixtureName);
  const { workDir } = await getWorkDir(fixtureName, fixtureSource);

  const result = (await build({
    files: {},
    workPath: workDir,
    config: defaultConfig,
    meta,
    entrypoint: 'package.json',
    repoRootPath: workDir,
  })) as BuildResultV2Typical;

  const lambda = result.output.index as unknown as NodejsLambda;
  expect(result.output['_svc/js-api/index']).toBeUndefined();
  expect(lambda.handler).toBe('index.mjs');
}, 30000);

it('strips service route prefixes for express apps at runtime', async () => {
  const fixtureName = '01-express-index-ts-esm';
  const fixtureSource = join(__dirname, 'fixtures', fixtureName);
  const { workDir, lambdaOutputDir } = await getWorkDir(
    fixtureName,
    fixtureSource
  );

  const result = (await build({
    files: {},
    workPath: workDir,
    config: {
      ...defaultConfig,
      routePrefix: 'api/js',
      serviceName: 'js-api',
    },
    meta,
    entrypoint: 'package.json',
    repoRootPath: workDir,
  })) as BuildResultV2Typical;

  const lambda = getServiceLambda(result, 'js-api');
  const response = await requestBuiltLambda({
    lambda,
    dir: lambdaOutputDir,
    path: '/api/js/user/123',
    routePrefix: '/api/js',
  });

  expect(response.status).toBe(200);
  expect(readLambdaResponseBody(response)).toBe('Hello World');
}, 30000);

it('strips service route prefixes for hono apps at runtime', async () => {
  const fixtureName = '04-hono-index-ts-esm';
  const fixtureSource = join(__dirname, 'fixtures', fixtureName);
  const { workDir, lambdaOutputDir } = await getWorkDir(
    fixtureName,
    fixtureSource
  );

  const result = (await build({
    files: {},
    workPath: workDir,
    config: {
      ...defaultConfig,
      routePrefix: 'api',
      serviceName: 'hono-api',
    },
    meta,
    entrypoint: 'package.json',
    repoRootPath: workDir,
  })) as BuildResultV2Typical;

  const lambda = getServiceLambda(result, 'hono-api');
  const response = await requestBuiltLambda({
    lambda,
    dir: lambdaOutputDir,
    path: '/api/user/123',
    routePrefix: '/api',
  });

  expect(response.status).toBe(200);
  expect(readLambdaResponseBody(response)).toBe('User ID: 123');
}, 30000);

const extractAndExecuteLambda = async (
  lambda: NodejsLambda,
  dir: string,
  extractDirectly = false
) => {
  const { handlerPath, unzipPath } = await extractLambda(
    lambda,
    dir,
    extractDirectly
  );

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

const extractLambda = async (
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

  return {
    unzipPath,
    handlerPath: join(unzipPath, lambda.handler),
  };
};

const getServiceLambda = (result: BuildResultV2Typical, serviceName: string) =>
  result.output[`_svc/${serviceName}/index`] as unknown as NodejsLambda;

const requestBuiltLambda = async (args: {
  lambda: NodejsLambda;
  dir: string;
  path: string;
  routePrefix: string;
}) => {
  const { handlerPath } = await extractLambda(args.lambda, args.dir);
  const originalEmit = HttpServer.prototype.emit;
  const originalRoutePrefix = process.env.VERCEL_SERVICE_ROUTE_PREFIX;
  const originalStrip = process.env.VERCEL_SERVICE_ROUTE_PREFIX_STRIP;

  process.env.VERCEL_SERVICE_ROUTE_PREFIX = args.routePrefix;
  process.env.VERCEL_SERVICE_ROUTE_PREFIX_STRIP = '1';

  try {
    const { handler, onExit } = await createServerlessEventHandler(
      handlerPath,
      {
        mode: 'buffer',
        shouldAddHelpers: false,
      }
    );

    try {
      return await handler({
        method: 'GET',
        url: args.path,
        headers: {
          host: 'example.com',
          'x-forwarded-host': 'example.com',
        },
      } as unknown as IncomingMessage);
    } finally {
      await onExit();
    }
  } finally {
    HttpServer.prototype.emit = originalEmit;
    delete (globalThis as any)[SERVICE_ROUTE_PREFIX_PATCH];
    restoreEnvVar('VERCEL_SERVICE_ROUTE_PREFIX', originalRoutePrefix);
    restoreEnvVar('VERCEL_SERVICE_ROUTE_PREFIX_STRIP', originalStrip);
  }
};

const readLambdaResponseBody = (
  response: Awaited<ReturnType<typeof requestBuiltLambda>>
) => {
  if (response.body === null) {
    return '';
  }

  return Buffer.isBuffer(response.body)
    ? response.body.toString(response.encoding)
    : '';
};

const restoreEnvVar = (name: string, value: string | undefined) => {
  if (typeof value === 'string') {
    process.env[name] = value;
  } else {
    delete process.env[name];
  }
};
