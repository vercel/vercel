import * as fs from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  deserializeBuildOutputCore,
  deserializeLambda,
  finalizeBuildOutputCoreResult,
  Lambda,
  NowBuildError,
  validateDeploymentId,
  type DeploymentFlagLegacy,
  type DeserializeNodejsLambdaParams,
  type DeploymentFlags,
  type SerializedNodejsLambda,
} from '../src';

function getThrownError(fn: () => void): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error('Expected function to throw');
}

describe('validateDeploymentId', () => {
  it('throws on too-long deployment IDs', () => {
    const error = getThrownError(() => validateDeploymentId('x'.repeat(33)));

    expect(error).toBeInstanceOf(NowBuildError);
    expect((error as NowBuildError).code).toBe(
      'VC_BUILD_INVALID_DEPLOYMENT_ID_LENGTH'
    );
  });

  it('throws on deployment IDs with invalid characters', () => {
    const error = getThrownError(() =>
      validateDeploymentId('invalid deployment id?')
    );

    expect(error).toBeInstanceOf(NowBuildError);
    expect((error as NowBuildError).code).toBe(
      'VC_BUILD_INVALID_DEPLOYMENT_ID_CHARACTERS'
    );
  });
});

describe('deserialize shared core', () => {
  it('normalizes streaming before invoking custom lambda creators', async () => {
    const created: DeserializeNodejsLambdaParams[] = [];

    const lambda = await deserializeLambda({
      files: {},
      config: {
        type: 'Lambda',
        architecture: 'x86_64',
        environment: {},
        handler: 'index.handler',
        launcherType: 'Nodejs',
        runtime: 'nodejs20.x',
        shouldAddHelpers: false,
        shouldAddSourcemapSupport: false,
        awsLambdaHandler: '',
        external: {
          awsAccountId: '123',
          digest: 'abc',
          size: 1,
        },
      } as SerializedNodejsLambda,
      repoRootPath: '',
      fileFsRefsCache: new Map(),
      forceNodejsStreaming: true,
      createNodejsLambda(params) {
        created.push(params);
        return new Lambda(params as ConstructorParameters<typeof Lambda>[0]);
      },
    });

    expect(created).toHaveLength(1);
    expect(created[0]?.supportsResponseStreaming).toBe(true);
    expect(created[0]?.external?.digest).toBe('abc');
    expect(lambda.supportsResponseStreaming).toBe(true);
  });

  it('applies grouping, warnings, metadata inspection, and config validation', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'deserialize-core-'));
    const outputDir = join(root, '.vercel', 'output');
    const warnings: string[] = [];
    const validatedConfigs: string[] = [];

    try {
      await fs.outputJSON(join(outputDir, 'config.json'), {
        version: 3,
        framework: { version: 'nextjs@14.0.0' },
        overrides: {
          'hello.txt': { path: 'renamed.txt' },
          'missing.txt': { path: 'missing-renamed.txt' },
        },
      });
      await fs.outputFile(join(outputDir, 'static', 'hello.txt'), 'hello');
      await fs.outputJSON(
        join(outputDir, 'functions', 'api', 'hello.func', '.vc-config.json'),
        {
          type: 'Lambda',
          architecture: 'x86_64',
          environment: {},
          handler: 'index.handler',
          launcherType: 'Nodejs',
          runtime: 'nodejs20.x',
          shouldAddHelpers: false,
          shouldAddSourcemapSupport: false,
          experimentalAllowBundling: true,
        }
      );
      await fs.outputFile(
        join(outputDir, 'functions', 'api', 'hello.func', 'index.js'),
        'exports.handler = () => {};'
      );

      const result = await deserializeBuildOutputCore({
        outputDir,
        repoRootPath: root,
        warn(message) {
          warnings.push(message);
        },
        validateConfig(config) {
          validatedConfigs.push(config.version?.toString() ?? 'unknown');
        },
        inspectLambda({ path }) {
          return {
            hasServerActions: path === 'api/hello',
          };
        },
        groupLambdas({ lambdas }) {
          expect(Object.keys(lambdas)).toEqual(['api/hello']);
          return {
            'api/hello': new Lambda({
              files: {},
              handler: 'grouped.handler',
              runtime: 'nodejs20.x',
            }),
          };
        },
      });

      expect(validatedConfigs).toEqual(['3']);
      expect(warnings).toEqual([
        'Warning: Override path "missing.txt" was not detected as an output path',
      ]);
      expect(result.meta?.hasServerActions).toBe(true);
      expect(result.output['renamed.txt']).toBeDefined();
      expect(result.output['hello.txt']).toBeUndefined();
      expect(result.framework).toEqual({ version: 'nextjs@14.0.0' });

      const groupedOutput = result.output['api/hello'];
      expect(groupedOutput?.type).toBe('Lambda');
      if (groupedOutput?.type !== 'Lambda') {
        throw new Error('Expected grouped lambda output');
      }
      expect(groupedOutput.handler).toBe('grouped.handler');
    } finally {
      await fs.remove(root);
    }
  });

  it('surfaces config validation errors before deserializing output', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'deserialize-core-'));
    const outputDir = join(root, '.vercel', 'output');

    try {
      await fs.outputJSON(join(outputDir, 'config.json'), {
        version: 3,
      });
      await fs.ensureDir(join(outputDir, 'static'));
      await fs.ensureDir(join(outputDir, 'functions'));

      await expect(
        deserializeBuildOutputCore({
          outputDir,
          repoRootPath: root,
          validateConfig() {
            throw new Error('invalid config');
          },
        })
      ).rejects.toThrow('invalid config');
    } finally {
      await fs.remove(root);
    }
  });

  it('finalizes the core result into the existing caller shape', () => {
    const flags: DeploymentFlags = {
      definitions: {
        foo: {
          url: 'https://example.com/flags/foo',
        },
      },
    };

    const result = finalizeBuildOutputCoreResult({
      config: {
        version: 3,
        wildcard: [{ domain: 'example.com', value: '1' }],
        images: {
          sizes: [16],
          domains: ['example.com'],
        },
        crons: [{ path: '/api/cron', schedule: '0 0 * * *' }],
        routes: [{ src: '/(.*)', dest: '/api' }],
        deploymentId: 'dpl_123',
      },
      flags,
      output: {},
      framework: { version: 'nextjs@14.0.0' },
      meta: { hasServerActions: true },
    });

    expect(result).toEqual({
      wildcard: [{ domain: 'example.com', value: '1' }],
      images: {
        sizes: [16],
        domains: ['example.com'],
      },
      crons: [{ path: '/api/cron', schedule: '0 0 * * *' }],
      flags,
      routes: [{ src: '/(.*)', dest: '/api' }],
      output: {},
      framework: { version: 'nextjs@14.0.0' },
      deploymentId: 'dpl_123',
      meta: { hasServerActions: true },
    });
  });

  it('applies default metadata when the core result does not set meta', () => {
    const result = finalizeBuildOutputCoreResult(
      {
        config: {
          version: 3,
        },
        output: {},
      },
      {
        defaultMeta: {
          hasServerActions: false,
        },
      }
    );

    expect(result.meta).toEqual({ hasServerActions: false });
  });

  it('falls back to legacy config flags when flags.json is absent', () => {
    const legacyFlags: DeploymentFlagLegacy[] = [
      {
        key: 'foo',
        metadata: {
          description: 'flag',
        },
      },
    ];

    const result = finalizeBuildOutputCoreResult({
      config: {
        version: 3,
        flags: legacyFlags,
      },
      output: {},
    });

    expect(result.flags).toEqual(legacyFlags);
  });
});
