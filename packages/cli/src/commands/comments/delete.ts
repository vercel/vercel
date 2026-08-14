import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { canPrompt } from '../../util/can-prompt';
import { validateJsonOutput } from '../../util/output-format';
import { outputError } from '../../util/command-validation';
import type { CommentsTelemetryClient } from '../../util/telemetry/commands/comments';
import { deleteSubcommand } from './command';
import { handleCommentsParseError, threadNotFoundMessage } from './errors';
import { deleteMessage, isAPIError, toApiErrorParts } from './api';
import { resolveCommentsScope } from './scope';
import { parseThreadArg } from './threads';

export default async function deleteCommentMessage(
  client: Client,
  telemetry: CommentsTelemetryClient
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(deleteSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    return handleCommentsParseError(err, 'delete');
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const jsonOutput = formatResult.jsonOutput;
  const yes = Boolean(parsedArgs.flags['--yes']);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);
  telemetry.trackCliFlagYes(parsedArgs.flags['--yes']);

  const [threadInput, messageId] = parsedArgs.args.slice(2);
  telemetry.trackCliArgumentThread(threadInput);
  telemetry.trackCliArgumentMessageId(messageId);
  if (!threadInput || !messageId) {
    return outputError(
      client,
      jsonOutput,
      'MISSING_ARGUMENT',
      'Usage: `vercel comments delete <thread> <message-id>` — message IDs are shown in `vercel comments inspect`.'
    );
  }
  const threadRef = parseThreadArg(threadInput);
  if (!threadRef) {
    return outputError(
      client,
      jsonOutput,
      'INVALID_THREAD',
      `Could not extract a thread ID from "${threadInput}".`
    );
  }
  const threadId = threadRef.id;

  const scope = await resolveCommentsScope(client, {
    project: parsedArgs.flags['--project'],
    requireProject: false,
    jsonOutput,
    urlTeamSlug: threadRef.teamSlug,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  if (!yes) {
    if (!canPrompt(client) || jsonOutput) {
      return outputError(
        client,
        jsonOutput,
        'CONFIRMATION_REQUIRED',
        'Pass --yes to delete the message non-interactively.'
      );
    }
    const confirmed = await client.input.confirm(
      `${chalk.red('Delete')} message ${messageId} from ${threadId} in team ${scope.teamSlug ?? scope.teamId}? This cannot be undone.`,
      false
    );
    if (!confirmed) {
      output.log('Canceled.');
      return 0;
    }
  }

  telemetry.trackCliOptionProject(parsedArgs.flags['--project']);
  try {
    const result = await deleteMessage(
      client,
      scope.teamId,
      threadId,
      messageId
    );

    if (jsonOutput) {
      client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }
    output.print(`${chalk.green('✓')} Deleted message ${messageId}\n`);
    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      const { code, message } = toApiErrorParts(err);
      return outputError(
        client,
        jsonOutput,
        code,
        err.status === 404 ? threadNotFoundMessage(threadId, scope) : message
      );
    }
    throw err;
  }
}
