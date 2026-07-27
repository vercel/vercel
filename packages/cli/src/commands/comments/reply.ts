import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { validateJsonOutput } from '../../util/output-format';
import { outputError } from '../../util/command-validation';
import type { CommentsTelemetryClient } from '../../util/telemetry/commands/comments';
import { replySubcommand } from './command';
import { handleCommentsParseError, threadNotFoundMessage } from './errors';
import { addMessage, isAPIError, toApiErrorParts } from './api';
import { resolveCommentsScope } from './scope';
import { parseThreadArg } from './threads';
import { resolveMessageContent } from './content';

function validateAttachments(attach: string[] | undefined): string | undefined {
  if (!attach || attach.length === 0) {
    return undefined;
  }
  if (attach.length > 10) {
    return 'A message can have at most 10 attachments.';
  }
  for (const url of attach) {
    if (!/^https:\/\//i.test(url)) {
      return `Attachments must be https URLs (the API fetches them); got "${url}". Local file upload is not supported by the API.`;
    }
  }
  return undefined;
}

export default async function reply(
  client: Client,
  telemetry: CommentsTelemetryClient
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(replySubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    return handleCommentsParseError(err, 'reply');
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
  telemetry.trackCliOptionAttach(parsedArgs.flags['--attach']);

  const threadInput = parsedArgs.args[2];
  telemetry.trackCliArgumentThread(threadInput);
  if (!threadInput) {
    return outputError(
      client,
      jsonOutput,
      'MISSING_THREAD',
      'Pass a thread ID or URL: `vercel comments reply <thread> -m <text>`.'
    );
  }
  const threadRef = parseThreadArg(threadInput);
  if (!threadRef) {
    return outputError(
      client,
      jsonOutput,
      'INVALID_THREAD',
      `Could not extract a thread ID from "${threadInput}". Pass the thread ID or its vercel.com URL.`
    );
  }
  const threadId = threadRef.id;

  const attach = parsedArgs.flags['--attach'];
  const attachError = validateAttachments(attach);
  if (attachError) {
    return outputError(client, jsonOutput, 'INVALID_ATTACHMENT', attachError);
  }

  const content = await resolveMessageContent(
    client,
    {
      message: parsedArgs.flags['--message'],
      file: parsedArgs.flags['--file'],
      hasAttachments: Boolean(attach && attach.length > 0),
    },
    jsonOutput
  );
  if (typeof content === 'number') {
    return content;
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

  if (!jsonOutput) {
    output.spinner('Posting reply…');
  }
  try {
    const message = await addMessage(client, scope.teamId, threadId, {
      ...(content !== undefined && { markdown: content }),
      ...(attach &&
        attach.length > 0 && { attachments: attach.map(url => ({ url })) }),
    });

    if (jsonOutput) {
      client.stdout.write(`${JSON.stringify(message, null, 2)}\n`);
      return 0;
    }

    output.print(`${chalk.green('✓')} Replied to ${threadId}\n`);
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
  } finally {
    output.stopSpinner();
  }
}
