import type {
  BuildOptions,
  BuildResultV2,
  BuildResultV2Typical,
  Diagnostics,
  PrepareCache,
  StartDevServerOptions,
  StartDevServerResult,
} from '@vercel/build-utils';
import { sanitizeConsumerName } from '@vercel/build-utils';
// @ts-expect-error - Builder packages intentionally do not publish declarations.
import * as containerBuilder from '@vercel/container';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateDockerfile } from './dockerfile';
import { inspectLaravelProject } from './project';

const {
  buildWithContainerSource,
  prepareCache: prepareContainerCache,
  startDevServerWithContainerSource,
} = containerBuilder;

export const version = 2;

async function withGeneratedSource<T>(
  workPath: string,
  buildEnv: Record<string, string | undefined>,
  run: (source: {
    dockerfilePath: string;
    contextDir: string;
    functionSource: string;
  }) => Promise<T>
): Promise<T> {
  const project = inspectLaravelProject(workPath);
  const temporaryDir = mkdtempSync(path.join(tmpdir(), 'vercel-laravel-'));
  const dockerfilePath = path.join(temporaryDir, 'Dockerfile');
  writeFileSync(dockerfilePath, generateDockerfile(project, buildEnv));
  try {
    return await run({
      dockerfilePath,
      contextDir: workPath,
      functionSource: 'artisan',
    });
  } finally {
    rmSync(temporaryDir, { recursive: true, force: true });
  }
}

function withLaravelFramework<T extends BuildOptions | StartDevServerOptions>(
  options: T
): T {
  return {
    ...options,
    config: { ...options.config, framework: 'laravel' },
  };
}

export async function build(options: BuildOptions): Promise<BuildResultV2> {
  const project = inspectLaravelProject(options.workPath);
  const result = await withGeneratedSource(
    options.workPath,
    options.meta?.buildEnv ?? {},
    source => buildWithContainerSource(withLaravelFramework(options), source)
  );
  const typicalResult = result as BuildResultV2Typical;
  const output = typicalResult.output as Record<string, any>;
  const web = output.index;
  if (web && project.queueTriggers.length > 0) {
    for (const [index, trigger] of project.queueTriggers.entries()) {
      const functionPath = `__vercel_laravel_queue_${index}`;
      output[functionPath] = {
        ...web,
        environment: {
          ...web.environment,
          VERCEL_LARAVEL_QUEUE_CALLBACK: '1',
        },
        experimentalTriggers: [
          {
            type: 'queue/v2beta',
            ...trigger,
            consumer: sanitizeConsumerName(functionPath),
          },
        ],
      };
    }
  }
  typicalResult.framework = {
    slug: 'laravel',
    version: project.laravelVersion,
  };
  return typicalResult;
}

export async function startDevServer(
  options: StartDevServerOptions
): Promise<StartDevServerResult> {
  return withGeneratedSource(
    options.workPath,
    options.meta?.buildEnv ?? {},
    source =>
      startDevServerWithContainerSource(withLaravelFramework(options), source)
  );
}

export const prepareCache: PrepareCache = prepareContainerCache;
export const diagnostics: Diagnostics = containerBuilder.diagnostics;

export { generateDockerfile } from './dockerfile';
export {
  inspectLaravelProject,
  resolvePhpVersion,
  SUPPORTED_PHP_VERSIONS,
} from './project';
