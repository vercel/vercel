import chalk from 'chalk';
import type Client from '../../../util/client';
import table from '../../../util/output/table';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import output from '../../../output-manager';
import { isAPIError } from '../../../util/errors-ts';
import {
  outputError,
  validateOptionalIntegerRange,
} from '../../../util/command-validation';
import { outputAgentError } from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import type { VcrTelemetryClient } from '../../../util/telemetry/commands/vcr';
import {
  tagsLsSubcommand,
  TAGS_SORT_BY_CHOICES,
  TAGS_SORT_ORDER_CHOICES,
} from './command';
import { resolveVcrScope } from '../utils/resolve-vcr-scope';
import { formatBytes, formatDigest, formatRelativeTime } from '../utils/format';
import {
  requireVcrRepository,
  validateVcrChoice,
  validateVcrJsonOutput,
} from '../utils/validators';
import { emitVcrArgParseError, handleVcrApiError } from '../utils/errors';
import { repositoryTagsPath } from '../utils/paths';

interface Tag {
  tag: string;
  imageId: string;
  manifestDigest: string;
  arch?: string;
  platform?: string;
  sizeInBytes: number;
  createdAt: string;
  updatedAt: string;
}

interface TagList {
  tags: Tag[];
  nextCursor?: string;
}

function printTags(list: TagList): void {
  if (list.tags.length === 0) {
    output.log('No tags found.');
    return;
  }

  const headers = ['Tag', 'Image ID', 'Digest', 'Arch', 'Size', 'Created'].map(
    h => chalk.cyan(h)
  );
  const rows = [
    headers,
    ...list.tags.map(tag => [
      chalk.bold(tag.tag),
      chalk.dim(tag.imageId),
      chalk.dim(formatDigest(tag.manifestDigest)),
      tag.arch ?? '-',
      formatBytes(tag.sizeInBytes),
      formatRelativeTime(tag.createdAt),
    ]),
  ];

  const tableOutput = table(rows, { hsep: 3 })
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .replace(/^/gm, '  ');
  output.print(`\n${tableOutput}\n`);

  if (list.nextCursor) {
    output.log(
      `More results available. Re-run with \`--cursor ${list.nextCursor}\`.`
    );
  }
}

export default async function ls(
  client: Client,
  argv: string[],
  telemetry: VcrTelemetryClient
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(tagsLsSubcommand.options)
    );
  } catch (err) {
    emitVcrArgParseError(
      client,
      err,
      'vcr tag ls <repository> --project <name-or-id>'
    );
    printError(err);
    return 1;
  }

  const fr = validateVcrJsonOutput(client, parsedArgs.flags);
  if (typeof fr === 'number') {
    return fr;
  }

  const repository = parsedArgs.args[0];
  const project = parsedArgs.flags['--project'] as string | undefined;
  const cursor = parsedArgs.flags['--cursor'] as string | undefined;
  const limitFlag = parsedArgs.flags['--limit'] as number | undefined;
  const sortBy = parsedArgs.flags['--sort-by'] as string | undefined;
  const sortOrder = parsedArgs.flags['--sort-order'] as string | undefined;

  telemetry.trackCliOptionProject(project);
  telemetry.trackCliOptionLimit(limitFlag);
  telemetry.trackCliOptionCursor(cursor);
  telemetry.trackCliOptionSortBy(sortBy);
  telemetry.trackCliOptionSortOrder(sortOrder);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);

  const missingRepository = requireVcrRepository(
    client,
    repository,
    fr.jsonOutput,
    'vcr tag ls <repository>'
  );
  if (typeof missingRepository === 'number') {
    return missingRepository;
  }

  const limitResult = validateOptionalIntegerRange(limitFlag, {
    flag: '--limit',
    min: 1,
    max: 100,
  });
  if (!limitResult.valid) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: limitResult.message,
      },
      1
    );
    return outputError(
      client,
      fr.jsonOutput,
      limitResult.code,
      limitResult.message
    );
  }

  const sortByError = validateVcrChoice(
    client,
    '--sort-by',
    sortBy,
    TAGS_SORT_BY_CHOICES,
    fr.jsonOutput
  );
  if (typeof sortByError === 'number') {
    return sortByError;
  }

  const sortOrderError = validateVcrChoice(
    client,
    '--sort-order',
    sortOrder,
    TAGS_SORT_ORDER_CHOICES,
    fr.jsonOutput
  );
  if (typeof sortOrderError === 'number') {
    return sortOrderError;
  }

  const scope = await resolveVcrScope(client, {
    project,
    jsonOutput: fr.jsonOutput,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  const path = repositoryTagsPath(scope, repository, {
    limit: limitResult.value,
    cursor,
    sortBy,
    sortOrder,
  });
  output.spinner('Fetching tags...');
  try {
    const list = await client.fetch<TagList>(path);
    if (fr.jsonOutput) {
      client.stdout.write(`${JSON.stringify(list, null, 2)}\n`);
    } else {
      printTags(list);
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
