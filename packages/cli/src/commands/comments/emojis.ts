import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { validateJsonOutput } from '../../util/output-format';
import { outputError } from '../../util/command-validation';
import type { CommentsTelemetryClient } from '../../util/telemetry/commands/comments';
import { emojisSubcommand } from './command';
import { handleCommentsParseError } from './errors';
import { listEmojis, isAPIError, toApiErrorParts } from './api';
import { resolveCommentsScope } from './scope';

export default async function emojis(
  client: Client,
  telemetry: CommentsTelemetryClient
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(emojisSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    return handleCommentsParseError(err, 'emojis');
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const jsonOutput = formatResult.jsonOutput;
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);

  const search = parsedArgs.args[2];
  telemetry.trackCliArgumentSearch(search);

  telemetry.trackCliOptionProject(parsedArgs.flags['--project']);
  const scope = await resolveCommentsScope(client, {
    project: parsedArgs.flags['--project'],
    requireProject: false,
    jsonOutput,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  try {
    const response = await listEmojis(client, scope.teamId, search);

    if (jsonOutput) {
      client.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
      return 0;
    }

    if (response.emojis.length === 0) {
      output.log(
        search ? `No emojis match "${search}".` : 'No emojis available.'
      );
      return 0;
    }

    for (const entry of response.emojis) {
      output.print(`  ${entry.emoji}  ${entry.name}\n`);
    }
    if (response.pagination.hasMore) {
      output.log(
        `${response.emojis.length} of ${response.pagination.total} — refine the search`
      );
    }
    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      const { code, message } = toApiErrorParts(err);
      return outputError(client, jsonOutput, code, message);
    }
    throw err;
  }
}
