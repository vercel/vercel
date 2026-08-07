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
import { imagePath, repositoryPath } from '../utils/paths';
import {
  formatBytes,
  formatImageReference,
  formatImageStatus,
  formatRelativeTime,
} from '../utils/format';
import type { VcrImageStatus } from '../utils/format';
import type { VcrScope } from '../utils/resolve-vcr-scope';

interface Image {
  id: string;
  manifestDigest: string;
  kind: 'index' | 'manifest';
  arch?: string;
  platform?: string;
  sizeInBytes: number;
  status: VcrImageStatus;
  createdAt: string;
  tags: string[];
}

interface Repository {
  name: string;
}

function printImage(
  image: Image,
  scope: VcrScope,
  repository: Repository
): void {
  output.print('\n');
  output.print(`  ${chalk.cyan('ID')}\t\t\t${image.id}\n`);
  output.print(`  ${chalk.cyan('Digest')}\t\t${image.manifestDigest}\n`);
  output.print(
    `  ${chalk.cyan('Image')}\t\t\t${formatImageReference(
      scope.teamSlug,
      scope.projectName,
      repository.name,
      image.manifestDigest
    )}\n`
  );
  output.print(`  ${chalk.cyan('Type')}\t\t\t${image.kind}\n`);
  output.print(`  ${chalk.cyan('Arch')}\t\t\t${image.arch ?? '-'}\n`);
  output.print(`  ${chalk.cyan('Platform')}\t\t${image.platform ?? '-'}\n`);
  output.print(
    `  ${chalk.cyan('Size')}\t\t\t${formatBytes(image.sizeInBytes)}\n`
  );
  output.print(
    `  ${chalk.cyan('Status')}\t\t${formatImageStatus(image.status)}\n`
  );
  output.print(
    `  ${chalk.cyan('Created')}\t\t${formatRelativeTime(image.createdAt)}\n`
  );
  output.print(
    `  ${chalk.cyan('Tags')}\t\t\t${image.tags?.length ? image.tags.join(', ') : '-'}\n`
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
    if (fr.jsonOutput) {
      const result = await client.fetch<{ image: Image }>(path);
      client.stdout.write(`${JSON.stringify(result.image, null, 2)}\n`);
    } else {
      const [imageResult, repositoryResult] = await Promise.all([
        client.fetch<{ image: Image }>(path),
        client.fetch<{ repository: Repository }>(
          repositoryPath(scope, repository)
        ),
      ]);
      output.log(`${chalk.bold('Image')} ${chalk.cyan(imageId)}`);
      printImage(imageResult.image, scope, repositoryResult.repository);
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
