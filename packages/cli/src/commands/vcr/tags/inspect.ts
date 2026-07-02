import chalk from 'chalk';
import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import output from '../../../output-manager';
import { isAPIError } from '../../../util/errors-ts';
import type { VcrTelemetryClient } from '../../../util/telemetry/commands/vcr';
import { tagsInspectSubcommand } from './command';
import { resolveVcrScope } from '../utils/resolve-vcr-scope';
import {
  requireVcrRepositoryAndTag,
  validateVcrJsonOutput,
} from '../utils/validators';
import { emitVcrArgParseError, handleVcrApiError } from '../utils/errors';
import { repositoryPath, repositoryTagPath } from '../utils/paths';
import {
  formatBytes,
  formatImageStatus,
  formatRelativeTime,
  formatTagReference,
} from '../utils/format';
import type { VcrImageStatus } from '../utils/format';
import type { VcrScope } from '../utils/resolve-vcr-scope';

interface Tag {
  tag: string;
  manifestDigest: string;
  imageId: string;
  kind: 'index' | 'manifest';
  arch?: string;
  platform?: string;
  pushedBy?: string;
  status: VcrImageStatus;
  sizeInBytes: number;
  createdAt: string;
  updatedAt: string;
}

interface Repository {
  name: string;
}

function printTag(tag: Tag, scope: VcrScope, repository: Repository): void {
  output.print('\n');
  output.print(`  ${chalk.cyan('ID')}\t\t\t${tag.imageId}\n`);
  output.print(`  ${chalk.cyan('Digest')}\t\t${tag.manifestDigest}\n`);
  output.print(
    `  ${chalk.cyan('Image')}\t\t\t${formatTagReference(
      scope.teamSlug,
      scope.projectName,
      repository.name,
      tag.tag
    )}\n`
  );
  output.print(`  ${chalk.cyan('Type')}\t\t\t${tag.kind}\n`);
  output.print(`  ${chalk.cyan('Arch')}\t\t\t${tag.arch ?? '-'}\n`);
  output.print(`  ${chalk.cyan('Platform')}\t\t${tag.platform ?? '-'}\n`);
  output.print(
    `  ${chalk.cyan('Size')}\t\t\t${formatBytes(tag.sizeInBytes)}\n`
  );
  output.print(
    `  ${chalk.cyan('Status')}\t\t${formatImageStatus(tag.status)}\n`
  );
  output.print(
    `  ${chalk.cyan('Created')}\t\t${formatRelativeTime(tag.createdAt)}\n`
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
      getFlagsSpecification(tagsInspectSubcommand.options)
    );
  } catch (err) {
    emitVcrArgParseError(
      client,
      err,
      'vcr tag inspect <repository> <tag> --project <name-or-id>'
    );
    printError(err);
    return 1;
  }

  const fr = validateVcrJsonOutput(client, parsedArgs.flags);
  if (typeof fr === 'number') {
    return fr;
  }

  const repository = parsedArgs.args[0];
  const tag = parsedArgs.args[1];
  const project = parsedArgs.flags['--project'] as string | undefined;
  telemetry.trackCliOptionProject(project);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);

  const missingArgs = requireVcrRepositoryAndTag(
    client,
    repository,
    tag,
    fr.jsonOutput,
    'vcr tag inspect <repository> <tag>'
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

  const path = repositoryTagPath(scope, repository, tag);
  output.spinner('Fetching tag...');
  try {
    if (fr.jsonOutput) {
      const result = await client.fetch<{ tag: Tag }>(path);
      client.stdout.write(`${JSON.stringify(result.tag, null, 2)}\n`);
    } else {
      const [tagResult, repositoryResult] = await Promise.all([
        client.fetch<{ tag: Tag }>(path),
        client.fetch<{ repository: Repository }>(
          repositoryPath(scope, repository)
        ),
      ]);
      output.log(`${chalk.bold('Tag')} ${chalk.cyan(tag)}`);
      printTag(tagResult.tag, scope, repositoryResult.repository);
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
