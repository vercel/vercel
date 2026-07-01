import chalk from 'chalk';
import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import output from '../../../output-manager';
import { isAPIError } from '../../../util/errors-ts';
import type { VcrTelemetryClient } from '../../../util/telemetry/commands/vcr';
import { imageInspectSubcommand } from './command';
import { resolveVcrScope } from '../utils/resolve-vcr-scope';
import {
  requireVcrRepositoryAndImageId,
  validateVcrJsonOutput,
} from '../utils/validators';
import { emitVcrArgParseError, handleVcrApiError } from '../utils/errors';
import { imagePath } from '../utils/paths';
import { formatBytes, formatDigest, formatRelativeTime } from '../utils/format';

type ImageStatus = 'ready' | 'preparing' | 'unoptimized' | null;

interface Image {
  id: string;
  manifestDigest: string;
  kind: 'index' | 'manifest';
  arch?: string;
  platform?: string;
  sizeInBytes: number;
  status: ImageStatus;
  createdAt: string;
  tags: string[];
}

function formatStatus(status: ImageStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'preparing':
      return 'Preparing';
    case 'unoptimized':
      return 'Ready (unoptimized)';
    default:
      return '-';
  }
}

function printImage(image: Image): void {
  output.print('\n');
  output.print(`  ${chalk.cyan('ID')}\t\t${image.id}\n`);
  output.print(
    `  ${chalk.cyan('Digest')}\t\t${formatDigest(image.manifestDigest)}\n`
  );
  output.print(`  ${chalk.cyan('Type')}\t\t${image.kind}\n`);
  output.print(`  ${chalk.cyan('Arch')}\t\t${image.arch ?? '-'}\n`);
  output.print(`  ${chalk.cyan('Platform')}\t\t${image.platform ?? '-'}\n`);
  output.print(
    `  ${chalk.cyan('Size')}\t\t${formatBytes(image.sizeInBytes)}\n`
  );
  output.print(`  ${chalk.cyan('Status')}\t\t${formatStatus(image.status)}\n`);
  output.print(
    `  ${chalk.cyan('Created')}\t\t${formatRelativeTime(image.createdAt)}\n`
  );
  output.print(
    `  ${chalk.cyan('Tags')}\t\t${image.tags?.length ? image.tags.join(', ') : '-'}\n`
  );
  output.print('\n');
}

export default async function inspect(
  client: Client,
  argv: string[],
  telemetry: VcrTelemetryClient
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(imageInspectSubcommand.options)
    );
  } catch (err) {
    emitVcrArgParseError(
      client,
      err,
      'vcr image inspect <repository> <imageId> --project <name-or-id>'
    );
    printError(err);
    return 1;
  }

  const fr = validateVcrJsonOutput(client, parsedArgs.flags);
  if (typeof fr === 'number') {
    return fr;
  }

  const repository = parsedArgs.args[0];
  const imageId = parsedArgs.args[1];
  const project = parsedArgs.flags['--project'] as string | undefined;
  telemetry.trackCliOptionProject(project);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);

  const missingArgs = requireVcrRepositoryAndImageId(
    client,
    repository,
    imageId,
    fr.jsonOutput,
    'vcr image inspect <repository> <imageId>'
  );
  if (typeof missingArgs === 'number') {
    return missingArgs;
  }

  const scope = await resolveVcrScope(client, {
    project,
    jsonOutput: fr.jsonOutput,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  const path = imagePath(scope, repository, imageId);
  output.spinner('Fetching image...');
  try {
    const result = await client.fetch<{ image: Image }>(path);
    if (fr.jsonOutput) {
      client.stdout.write(`${JSON.stringify(result.image, null, 2)}\n`);
    } else {
      output.log(`${chalk.bold('Image')} ${chalk.cyan(imageId)}`);
      printImage(result.image);
    }
    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      return handleVcrApiError(client, err, fr.jsonOutput);
    }
    throw err;
  } finally {
    output.stopSpinner();
  }
}
