import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { validateJsonOutput } from '../../util/output-format';
import { outputError } from '../../util/command-validation';
import type { CommentsTelemetryClient } from '../../util/telemetry/commands/comments';
import { editSubcommand } from './command';
import { handleCommentsParseError, threadNotFoundMessage } from './errors';
import { updateMessage, isAPIError, toApiErrorParts } from './api';
import { resolveCommentsScope } from './scope';
import { parseThreadArg } from './threads';
import { resolveMessageContent } from './content';

export default async function edit(
  client: Client,
  telemetry: CommentsTelemetryClient
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(editSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    return handleCommentsParseError(err, 'edit');
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const jsonOutput = formatResult.jsonOutput;
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);
  telemetry.trackCliOptionMessage(parsedArgs.flags['--message']);
  telemetry.trackCliOptionFile(parsedArgs.flags['--file']);

  const [threadInput, messageId] = parsedArgs.args.slice(2);
  telemetry.trackCliArgumentThread(threadInput);
  telemetry.trackCliArgumentMessageId(messageId);
  if (!threadInput || !messageId) {
    return outputError(
      client,
      jsonOutput,
      'MISSING_ARGUMENT',
      'Usage: `vercel comments edit <thread> <message-id> -m <text>` — message IDs are shown in `vercel comments inspect`.'
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

  const content = await resolveMessageContent(
    client,
    {
      message: parsedArgs.flags['--message'],
      file: parsedArgs.flags['--file'],
    },
    jsonOutput
  );
  if (typeof content === 'number') {
    return content;
  }
  if (content === undefined) {
    return outputError(
      client,
      jsonOutput,
      'MISSING_CONTENT',
      'Pass the new content with -m <text> or --file <path>.'
    );
  }

  telemetry.trackCliOptionProject(parsedArgs.flags['--project']);
  const scope = await resolveCommentsScope(client, {
    project: parsedArgs.flags['--project'],
    requireProject: false,
    jsonOutput,
    urlTeamSlug: threadRef.teamSlug,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  try {
    // `attachments` is deliberately omitted: the API treats it as the desired
    // final list, and omitting the field preserves existing attachments.
    const message = await updateMessage(
      client,
      scope.teamId,
      threadId,
      messageId,
      { markdown: content }
    );

    if (jsonOutput) {
      client.stdout.write(`${JSON.stringify(message, null, 2)}\n`);
      return 0;
    }
    output.print(`${chalk.green('✓')} Edited message ${messageId}\n`);
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
