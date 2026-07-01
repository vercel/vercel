import chalk from 'chalk';
import type Client from '../../../util/client';
import table from '../../../util/output/table';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import output from '../../../output-manager';
import { validateJsonOutput } from '../../../util/output-format';
import { isAPIError } from '../../../util/errors-ts';
import {
  outputError,
  validateOptionalIntegerRange,
} from '../../../util/command-validation';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import { packageName } from '../../../util/pkg-name';
import type { VcrTelemetryClient } from '../../../util/telemetry/commands/vcr';
import { imageLsSubcommand } from './command';
import { resolveVcrScope } from '../resolve-vcr-scope';
import { formatBytes } from '../format';
import {
  emitVcrArgParseError,
  handleVcrApiError,
  repositoryImagesPath,
} from '../util';

interface Image {
  id: string;
  manifestDigest: string;
  arch?: string;
  platform?: string;
  sizeInBytes: number;
  tags: string[];
}

interface ImageList {
  images: Image[];
  nextCursor?: string;
}

function printImages(list: ImageList): void {
  if (list.images.length === 0) {
    output.log('No images found.');
    return;
  }

  const headers = ['Image ID', 'Tags', 'Arch', 'Size'].map(h => chalk.cyan(h));
  const rows = [
    headers,
    ...list.images.map(image => [
      chalk.bold(image.id),
      image.tags.length > 0 ? image.tags.join(', ') : chalk.dim('<none>'),
      image.arch ?? '-',
      formatBytes(image.sizeInBytes),
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
      `\nMore results available. Re-run with \`--cursor ${list.nextCursor}\`.`
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
      getFlagsSpecification(imageLsSubcommand.options)
    );
  } catch (err) {
    emitVcrArgParseError(
      client,
      err,
      'vcr image ls <repository> --project <name-or-id>'
    );
    printError(err);
    return 1;
  }

  const fr = validateJsonOutput(parsedArgs.flags);
  if (!fr.valid) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: fr.error,
      },
      1
    );
    output.error(fr.error);
    return 1;
  }

  const repository = parsedArgs.args[0];
  const project = parsedArgs.flags['--project'] as string | undefined;
  const cursor = parsedArgs.flags['--cursor'] as string | undefined;
  const limitFlag = parsedArgs.flags['--limit'] as number | undefined;
  const untagged = parsedArgs.flags['--untagged'] as boolean | undefined;

  telemetry.trackCliOptionProject(project);
  telemetry.trackCliOptionLimit(limitFlag);
  telemetry.trackCliOptionCursor(cursor);
  telemetry.trackCliFlagUntagged(untagged);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);

  if (!repository) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: `Missing repository. Example: ${packageName} vcr image ls <repository>`,
        next: [
          {
            command: buildCommandWithGlobalFlags(client.argv, 'vcr ls'),
            when: 'List repositories to pick a name or id',
          },
        ],
      },
      1
    );
    return outputError(
      client,
      fr.jsonOutput,
      'MISSING_ARGUMENTS',
      'Usage: `vercel vcr image ls <repository>`'
    );
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

  const scope = await resolveVcrScope(client, {
    project,
    jsonOutput: fr.jsonOutput,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  const path = repositoryImagesPath(scope, repository, {
    limit: limitResult.value,
    cursor,
    untagged,
  });
  output.spinner('Fetching images...');
  try {
    const list = await client.fetch<ImageList>(path);
    if (fr.jsonOutput) {
      client.stdout.write(`${JSON.stringify(list, null, 2)}\n`);
    } else {
      printImages(list);
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
