import type { BuildOutputConfig } from './vendor/build-container/container/src/utils/build-output-api/build-output-config';
import {
  NowBuildError,
  SERVICE_NAME_PATTERN,
  type Lambda,
} from '@vercel/build-utils';
import { DescribeError } from './error';
import { getBuildOutputConfigOrThrow } from './vendor/build-container/container/src/utils/build-output-api/get-build-output-config';
import { getFunctionSourcePath } from './vendor/build-container/container/src/utils/build-output-api/get-function-source-path';
import { getMiddlewareRouting } from './vendor/build-container/container/src/utils/build-output-api/get-middleware-routing';
import { getServiceOutputEntries } from './vendor/build-container/container/src/utils/build-output-api/get-service-output-entries';
import { groupBundleableLambdas } from './vendor/build-container/container/src/utils/build-output-api/group-lambdas';
import { iterateNativeFunctionOutputs } from './vendor/build-container/container/src/utils/build-output-api/iterate-native-function-outputs';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { readFunctions } from './vendor/build-container/container/src/utils/build-output-api/functions/read-functions';
import { readServiceOutputConfig } from './vendor/build-container/container/src/utils/build-output-api/read-service-output-config';
import { validateBuildOutput } from './validate-build-output';
import { z } from 'zod/v3';

export interface FunctionOutput {
  directory: string;
  middleware?: Record<string, never>;
  path: string;
  service?: string;
  sourceKind: 'lambda' | 'prerender';
}

interface Params {
  directory: string;
  outputDir: string;
  repoRootPath: string;
}

export async function prepareFunctions(options: Params) {
  await validateBuildOutput(options);
  const config = await getBuildOutputConfigOrThrow(options.outputDir);

  if (
    'daemons' in config &&
    config.daemons &&
    Object.keys(config.daemons).length
  ) {
    throw new DescribeError(
      'unsupported_output',
      'This build contains daemons. Describe supports native AWS Lambda functions only.'
    );
  }

  const inventory = serviceInventorySchema.safeParse(
    config.experimentalServicesV2 ?? {}
  );
  if (!inventory.success) {
    throw new DescribeError(
      'invalid_build_output',
      'Invalid service inventory in config.json. Rebuild the service outputs before running describe.'
    );
  }

  const scopes: {
    config: BuildOutputConfig;
    directory: string;
    service?: string;
  }[] = [{ directory: '', config }];

  for (const entry of getServiceOutputEntries(config)) {
    if (entry.service.bindings?.length) {
      throw new DescribeError(
        'unsupported_output',
        'This build contains service bindings, which cannot be provisioned as AWS Lambda functions. Remove the bindings and rebuild before running describe.'
      );
    }
    const serviceConfig = await readServiceOutputConfig(
      options.outputDir,
      entry
    ).catch(error => {
      if (
        error instanceof NowBuildError &&
        error.code === 'MISSING_SERVICE_BUILD_OUTPUT'
      ) {
        throw new DescribeError(
          'invalid_build_output',
          `Service "${entry.name}" is missing build output at ".vercel/output/services/${entry.name}/config.json". Rebuild the service before running describe.`
        );
      }
      throw error;
    });

    if (!serviceConfig) {
      continue;
    }
    scopes.push({
      config: serviceConfig,
      directory: entry.directory,
      service: entry.name,
    });
  }

  const groups: { lambda: Lambda; outputs: FunctionOutput[] }[] = [];
  const paths = new Set<string>();
  for (const scope of scopes) {
    const functions = await readFunctions({
      outputDir: join(options.outputDir, scope.directory),
      repoRootPath: options.repoRootPath,
      prebuilt: true,
    });

    if (functions.edgeFunctions.size) {
      throw new DescribeError(
        'unsupported_output',
        'This build contains Edge Functions, which cannot be provisioned as AWS Lambda functions.'
      );
    }

    await groupBundleableLambdas({ functions, options: {} });
    const scopeGroups = new Map<Lambda, FunctionOutput[]>();
    const middlewarePaths = getMiddlewareRouting({
      routes: scope.config.routes ?? [],
      functions,
    });

    for (const output of iterateNativeFunctionOutputs(functions)) {
      const lambda = output.lambda;
      const directory = join(
        scope.directory,
        'functions',
        `${output.path}.func`
      );
      /** Hive configuration is not retained by the Lambda constructor. */
      const functionConfig = JSON.parse(
        await readFile(
          join(options.outputDir, directory, '.vc-config.json'),
          'utf8'
        )
      );
      if (
        lambda.runtime === 'container' ||
        functionConfig.hive ||
        functionConfig.affinity
      ) {
        throw new DescribeError(
          'unsupported_output',
          'This build contains container or Hive functions. Describe supports native AWS Lambda functions only.'
        );
      }
      const sourcePath = getFunctionSourcePath({
        output: { path: output.path },
        service: scope.service,
      });
      if (paths.has(sourcePath)) {
        throw new DescribeError(
          'invalid_build_output',
          `Multiple function outputs use "${sourcePath}". Rename the conflicting output and rebuild before running describe.`
        );
      }
      paths.add(sourcePath);
      const outputs = scopeGroups.get(lambda) ?? [];
      scopeGroups.set(lambda, outputs);
      outputs.push({
        sourceKind: output.prerender ? 'prerender' : 'lambda',
        middleware:
          output.prerender === undefined && middlewarePaths.has(output.path)
            ? {}
            : undefined,
        path: sourcePath,
        directory,
        service: scope.service,
      });
    }
    for (const [lambda, outputs] of scopeGroups)
      groups.push({ lambda, outputs });
  }

  return { groups, services: config.services };
}

const serviceInventorySchema = z.record(
  z.string().regex(new RegExp(SERVICE_NAME_PATTERN)),
  z.object({
    root: z.string().optional(),
    bindings: z.array(z.unknown()).optional(),
  })
);
