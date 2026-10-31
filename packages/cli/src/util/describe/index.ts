import type Client from '../client';
import { DescribeError } from './error';
import { createHash } from 'node:crypto';
import { describeFunctions } from './describe-functions';
import { isDeepStrictEqual } from 'node:util';
import { join } from 'node:path';
import { mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import { prepareContinuation } from './prepare-continuation';

interface PreparedFunction {
  configuration: Record<string, unknown>;
  layers: string[];
  region: string;
  code: string;
}

/**
 * Writes `.vercel/<id>/` (descriptor.json, zips/, layers/, build/) and
 * swaps `.vercel/output` for a code-free copy so `vercel deploy continue`
 * works from the project directory.
 */
export async function describeDeployment(
  client: Client,
  params: {
    teamId: string;
    awsAccountId: string;
    deploymentId: string;
    directory: string;
    repoRootPath?: string;
    quiet?: boolean;
  }
) {
  const output = join(params.directory, '.vercel', params.deploymentId);
  const buildOutput = join(params.directory, '.vercel/output');
  const build = join(output, 'build');
  const repoRootPath = params.repoRootPath ?? params.directory;
  const source =
    (await exists(buildOutput)) &&
    !(await exists(join(buildOutput, 'provision.json')))
      ? buildOutput
      : build;

  if (!(await exists(join(source, 'config.json')))) {
    throw new DescribeError(
      'prebuilt_not_found',
      `No local build output found. Run \`vercel build --deployment ${params.deploymentId}\` before \`vercel deploy describe\`.`
    );
  }

  await mkdir(join(params.directory, '.vercel'), { recursive: true });
  const staging = await mkdtemp(
    join(params.directory, '.vercel', `.describe-${params.deploymentId}-`)
  );
  let removeStaging = true;

  const functions = new Map<string, PreparedFunction>();
  const layers: Record<string, string> = {};
  const manifest: Record<string, unknown> = {};

  try {
    await mkdir(join(staging, 'zips'));
    await mkdir(join(staging, 'layers'));
    const described = await describeFunctions(client, {
      deploymentId: params.deploymentId,
      directory: params.directory,
      repoRootPath,
      outputDir: source,
      quiet: params.quiet,
      teamId: params.teamId,
      zipDirectory: join(staging, 'zips'),
    });

    for (const { path, digest, size, regional } of described) {
      for (const descriptor of regional) {
        const layerNames = [];

        for (const arn of descriptor.Layers) {
          const layer = descriptor.ResolvableLayers[arn];
          if (!layer) {
            throw new DescribeError(
              'invalid_response',
              'The deployment API did not provide a download URL for a required runtime layer.'
            );
          }

          const name = createHash('sha256').update(arn).digest('hex');
          layerNames.push(name);
          if (layers[name]) {
            continue;
          }

          const response = await fetch(layer.url, {
            signal: AbortSignal.timeout(60_000),
          });

          if (!response.ok) {
            throw new DescribeError(
              'layer_download_failed',
              'Could not download a required runtime layer. Retry this describe command.'
            );
          }

          const bytes = new Uint8Array(await response.arrayBuffer());
          const file = `layers/${createHash('sha256').update(bytes).digest('hex')}.zip`;
          await writeFile(join(staging, file), bytes, { mode: 0o600 });
          layers[name] = file;
        }

        const { Region, Layers, ResolvableLayers, ...configuration } =
          descriptor;
        const fn: PreparedFunction = {
          code: `zips/${digest}.zip`,
          region: Region,
          layers: layerNames,
          configuration,
        };

        const key = `${descriptor.Region}:${descriptor.FunctionName}`;
        const previous = functions.get(key);
        if (previous && !isDeepStrictEqual(previous, fn)) {
          throw new DescribeError(
            'invalid_response',
            'Conflicting descriptors for the same regional function'
          );
        }
        functions.set(key, fn);
      }

      manifest[path] = {
        awsAccountId: params.awsAccountId,
        digest,
        functionName: regional[0]!.FunctionName,
        regions: [...new Set(regional.map(d => d.Region))],
        size,
      };
    }

    await writeFile(
      join(staging, 'descriptor.json'),
      JSON.stringify(
        {
          awsAccountId: params.awsAccountId,
          deploymentId: params.deploymentId,
          functions: [...functions.values()],
          layers,
          version: 1,
        },
        null,
        2
      ),
      { mode: 0o600 }
    );

    await prepareContinuation({
      destination: join(staging, 'output'),
      directory: params.directory,
      functions: described,
      manifest,
      outputDir: source,
      repoRootPath,
    });

    // Keep previous artifacts (and caller-owned files such as provisioned.json)
    // until preparation succeeds. Record each rename so a failed replacement
    // can restore both the artifacts and the original build/continuation.
    await mkdir(output, { recursive: true, mode: 0o700 });
    const backup = join(staging, 'backup');
    await mkdir(backup);
    const moves: Array<[string, string]> = [];
    const move = async (from: string, to: string) => {
      await rename(from, to);
      moves.push([from, to]);
    };
    const preserve = async (path: string, name: string) => {
      if (await exists(path)) await move(path, join(backup, name));
    };

    try {
      for (const name of ['zips', 'layers', 'descriptor.json']) {
        await preserve(join(output, name), name);
        await move(join(staging, name), join(output, name));
      }
      if (source === buildOutput) {
        await preserve(build, 'build');
        await move(buildOutput, build);
      } else {
        await preserve(buildOutput, 'output');
      }
      await move(join(staging, 'output'), buildOutput);
    } catch (error) {
      // If rollback itself fails, retain the private staging directory and
      // its backups instead of deleting the only remaining copy.
      removeStaging = false;
      for (const [from, to] of moves.reverse()) {
        await rename(to, from);
      }
      removeStaging = true;
      throw error;
    }
    return output;
  } finally {
    if (removeStaging) await rm(staging, { recursive: true, force: true });
  }
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    error => {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  );
