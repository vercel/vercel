import * as fs from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { Lambda } from '../src/lambda';
import type {
  DeserializeBuildOutputConfig,
  DeserializeBuildOutputResult,
} from '../src/deserialize/deserialize-build-output-types';
import { deserializeBuildOutput } from '../src/deserialize/deserialize-build-output';

type LegacyFlag = {
  key: string;
  defaultValue?: unknown;
  metadata: Record<string, unknown>;
};

type TestConfig = DeserializeBuildOutputConfig<LegacyFlag[]>;
type TestResult = DeserializeBuildOutputResult<
  { definitions: Record<string, unknown> } | LegacyFlag[],
  { hasServerActions?: boolean }
>;

function normalizeOutputPath(path: string): string {
  return path.replaceAll('\\', '/');
}

function getOutputKey(
  output: Record<string, unknown>,
  expectedPath: string
): string {
  const matchingKey = Object.keys(output).find(
    path => normalizeOutputPath(path) === expectedPath
  );

  if (!matchingKey) {
    throw new Error(`Could not find output path "${expectedPath}"`);
  }

  return matchingKey;
}

async function createOutputFixture(config: Partial<TestConfig> = {}) {
  const repoRootPath = await fs.mkdtemp(join(tmpdir(), 'deserialize-build-'));
  const outputDir = join(repoRootPath, '.vercel', 'output');

  await fs.ensureDir(join(outputDir, 'static'));
  await fs.ensureDir(join(outputDir, 'functions'));
  await fs.outputJSON(join(outputDir, 'config.json'), {
    version: 3,
    ...config,
  });

  return {
    outputDir,
    repoRootPath,
    async cleanup() {
      await fs.remove(repoRootPath);
    },
  };
}

async function writeNodeFunction(outputDir: string, outputPath: string) {
  const functionDir = join(outputDir, 'functions', `${outputPath}.func`);
  await fs.outputJSON(join(functionDir, '.vc-config.json'), {
    handler: 'index.handler',
    launcherType: 'Nodejs',
    runtime: 'nodejs20.x',
    shouldAddHelpers: false,
    shouldAddSourcemapSupport: false,
  });
  await fs.outputFile(
    join(functionDir, 'index.js'),
    'exports.handler = () => "ok";'
  );
}

async function writePrerenderConfig(outputDir: string, outputPath: string) {
  await fs.outputJSON(
    join(outputDir, 'functions', `${outputPath}.prerender-config.json`),
    {
      expiration: 60,
      fallback: null,
    }
  );
}

function createLambda(handler: string, experimentalAllowBundling = false) {
  return new Lambda({
    files: {},
    handler,
    runtime: 'nodejs20.x',
    experimentalAllowBundling,
  });
}

class TestLambda extends Lambda {}

describe('deserializeBuildOutput()', () => {
  it.each([
    {
      deploymentId: 'x'.repeat(33),
      expectedCode: 'VC_BUILD_INVALID_DEPLOYMENT_ID_LENGTH',
    },
    {
      deploymentId: 'invalid deployment id?',
      expectedCode: 'VC_BUILD_INVALID_DEPLOYMENT_ID_CHARACTERS',
    },
  ])('validates deploymentId: $expectedCode', async ({
    deploymentId,
    expectedCode,
  }) => {
    const fixture = await createOutputFixture({ deploymentId });

    try {
      await expect(
        deserializeBuildOutput<TestConfig, TestResult>({
          outputDir: fixture.outputDir,
          repoRootPath: fixture.repoRootPath,
          deserializeLambda: async () => createLambda('noop.handler'),
          groupLambdas: async () => ({}),
        })
      ).rejects.toMatchObject({
        code: expectedCode,
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it('warns on missing overrides, remaps output paths, and supports caller-provided meta and deploymentId', async () => {
    const fixture = await createOutputFixture({
      deploymentId: 'dpl_custom',
      overrides: {
        'static/hello.txt': {
          path: 'static/renamed.txt',
        },
        'static/missing.txt': {
          path: 'static/never-created.txt',
        },
      },
    });
    const warn = vi.fn();

    try {
      await fs.outputFile(
        join(fixture.outputDir, 'static', 'static', 'hello.txt'),
        'hello'
      );
      await writeNodeFunction(fixture.outputDir, 'api/server-actions');

      const result = await deserializeBuildOutput<TestConfig, TestResult>({
        outputDir: fixture.outputDir,
        repoRootPath: fixture.repoRootPath,
        deserializeLambda: async () => createLambda('server-actions.handler'),
        groupLambdas: async () => ({}),
        inspectSerializedLambda: async path =>
          normalizeOutputPath(path) === 'api/server-actions',
        warn,
        includeDeploymentId: true,
        getMeta: hasServerActions => ({ hasServerActions }),
      });

      expect(result.output['static/renamed.txt']).toBeDefined();
      expect(result.output['static/hello.txt']).toBeUndefined();
      expect(result.deploymentId).toBe('dpl_custom');
      expect(result.meta).toEqual({ hasServerActions: true });
      expect(warn).toHaveBeenCalledWith(
        'Warning: Override path "static/missing.txt" was not detected as an output path'
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it('replaces grouped lambdas for plain lambdas and prerenders without adding meta or deploymentId by default', async () => {
    const fixture = await createOutputFixture({
      deploymentId: 'dpl_custom',
    });

    try {
      await writeNodeFunction(fixture.outputDir, 'api/plain');
      await writeNodeFunction(fixture.outputDir, 'api/prerendered');
      await writePrerenderConfig(fixture.outputDir, 'api/prerendered');

      let plainKey = '';
      let prerenderedKey = '';
      const result = await deserializeBuildOutput<TestConfig>({
        outputDir: fixture.outputDir,
        repoRootPath: fixture.repoRootPath,
        deserializeLambda: async (_files, _config, _repoRootPath, _cache) =>
          createLambda('original.handler', true),
        groupLambdas: async lambdas => {
          plainKey = getOutputKey(lambdas, 'api/plain');
          prerenderedKey = getOutputKey(lambdas, 'api/prerendered');

          return {
            ...lambdas,
            [plainKey]: createLambda('grouped-plain.handler'),
            [prerenderedKey]: createLambda('grouped-prerender.handler'),
          };
        },
      });

      expect(result.output[plainKey]).toEqual(
        expect.objectContaining({
          type: 'Lambda',
          handler: 'grouped-plain.handler',
        })
      );

      const prerenderOutput = result.output[prerenderedKey];
      expect(prerenderOutput.type).toBe('Prerender');
      if (prerenderOutput.type !== 'Prerender') {
        throw new Error('Expected prerender output');
      }
      expect(prerenderOutput.lambda).toEqual(
        expect.objectContaining({
          type: 'Lambda',
          handler: 'grouped-prerender.handler',
        })
      );
      expect(result.meta).toBeUndefined();
      expect(result.deploymentId).toBeUndefined();
    } finally {
      await fixture.cleanup();
    }
  });

  it('supports caller-provided Lambda subclasses through grouping callbacks', async () => {
    const fixture = await createOutputFixture();

    try {
      await writeNodeFunction(fixture.outputDir, 'api/custom-lambda');

      let customLambdaKey = '';
      const result = await deserializeBuildOutput<
        TestConfig,
        DeserializeBuildOutputResult,
        TestLambda
      >({
        outputDir: fixture.outputDir,
        repoRootPath: fixture.repoRootPath,
        deserializeLambda: async () =>
          new TestLambda({
            files: {},
            handler: 'custom.handler',
            runtime: 'nodejs20.x',
            experimentalAllowBundling: true,
          }),
        groupLambdas: async lambdas => {
          customLambdaKey = getOutputKey(lambdas, 'api/custom-lambda');
          expect(lambdas[customLambdaKey]).toBeInstanceOf(TestLambda);
          return lambdas;
        },
      });

      expect(result.output[customLambdaKey]).toBeInstanceOf(TestLambda);
    } finally {
      await fixture.cleanup();
    }
  });
});
