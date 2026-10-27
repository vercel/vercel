import type Client from '../client';
import { createHash } from 'node:crypto';
import { fetchDeploymentBuildEnv } from '../env/fetch-deployment-build-env';
import { getFunctionConfig } from './vendor/build-container/container/src/utils/build-output-api/functions/get-function-config';
import { hydrateLambdaFiles } from './vendor/build-container/container/src/utils/build-output-api/functions/hydrate-lambda-files';
import { join } from 'node:path';
import { prepareFunctions } from './prepare-functions';
import { writeFile } from 'node:fs/promises';
import { z } from 'zod/v3';

const descriptorSchema = z.object({
  Architectures: z.array(z.string()).optional(),
  Environment: z.object({ Variables: z.record(z.string()) }),
  EphemeralStorage: z.object({ Size: z.number() }).optional(),
  FunctionName: z.string().min(1),
  Handler: z.string(),
  Layers: z.array(z.string()),
  MemorySize: z.number(),
  Region: z.string().min(1),
  ResolvableLayers: z.record(z.object({ url: z.string() })),
  Runtime: z.string(),
  Tags: z.record(z.string()),
  Timeout: z.number().optional(),
});

interface DescribeOptions {
  deploymentId: string;
  directory: string;
  repoRootPath: string;
  outputDir: string;
  quiet?: boolean;
  teamId: string;
  zipDirectory: string;
}

export async function describeFunctions(
  client: Client,
  params: DescribeOptions
) {
  const functions = await prepareFunctions({
    directory: params.directory,
    repoRootPath: params.repoRootPath,
    outputDir: params.outputDir,
  });
  const buildEnv = z
    .object({
      VERCEL_ENCRYPTED_ENV_FILENAME: z.string().min(1),
      VERCEL_ENCRYPTED_ENV_CONTENT: z.string().min(1),
    })
    .parse(
      (
        await fetchDeploymentBuildEnv(client, params.deploymentId, {
          quiet: params.quiet,
        })
      ).buildEnv
    );

  const lambdas = (
    await Promise.all(
      functions.groups.map(async ({ lambda, outputs }) => {
        lambda.files = hydrateLambdaFiles(lambda, {
          filename: buildEnv.VERCEL_ENCRYPTED_ENV_FILENAME,
          contentBase64: buildEnv.VERCEL_ENCRYPTED_ENV_CONTENT,
        });
        const zip = await lambda.createZip();
        const bytes = new Uint8Array(
          zip.buffer,
          zip.byteOffset,
          zip.byteLength
        );
        const digest = createHash('sha256').update(bytes).digest('hex');
        await writeFile(join(params.zipDirectory, `${digest}.zip`), bytes, {
          mode: 0o600,
        });
        const config = getFunctionConfig(lambda);
        const input = {
          ...config,
          framework: config.framework && { slug: config.framework.slug },
          digest,
          size: bytes.length,
        };
        return outputs.map(output => ({ ...output, lambda: input }));
      })
    )
  ).flat();

  const { descriptors } = z
    .object({ descriptors: z.array(z.array(descriptorSchema).min(1)) })
    .parse(
      await client.fetch(
        `/v2/deployments/${params.deploymentId}/builds/function-descriptors`,
        {
          method: 'POST',
          body: JSON.stringify({
            lambdas: lambdas.map(output => ({
              lambda: output.lambda,
              path: output.path,
              service: output.service,
              sourceKind: output.sourceKind,
              middleware: output.middleware,
            })),
            services: functions.services,
          }),
          headers: { 'content-type': 'application/json' },
          accountId: params.teamId,
          retry: { retries: 0 },
        }
      )
    );

  if (descriptors.length !== lambdas.length) {
    throw new Error('Descriptor count does not match function outputs');
  }

  return lambdas.map(({ path, directory, lambda }, index) => {
    const regional = descriptors[index]!;
    if (new Set(regional.map(d => d.FunctionName)).size !== 1) {
      throw new Error('Inconsistent regional function name');
    }
    return {
      path,
      directory,
      digest: lambda.digest,
      size: lambda.size,
      regional,
    };
  });
}
