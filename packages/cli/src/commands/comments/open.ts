import open from 'open';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { outputError } from '../../util/command-validation';
import type { CommentsTelemetryClient } from '../../util/telemetry/commands/comments';
import { openSubcommand } from './command';
import { handleCommentsParseError, threadNotFoundMessage } from './errors';
import { getThread, isAPIError, toApiErrorParts } from './api';
import { resolveCommentsScope } from './scope';
import { parseThreadArg } from './threads';

export default async function openThread(
  client: Client,
  telemetry: CommentsTelemetryClient
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(openSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    return handleCommentsParseError(err, 'open');
  }

  const threadInput = parsedArgs.args[2];
  telemetry.trackCliArgumentThread(threadInput);
  if (!threadInput) {
    output.error('Pass a thread ID or URL: `vercel comments open <thread>`.');
    return 1;
  }

  const threadRef = parseThreadArg(threadInput);
  if (!threadRef) {
    output.error(
      `Could not extract a thread ID from "${threadInput}". Pass the thread ID or its vercel.com URL.`
    );
    return 1;
  }
  const threadId = threadRef.id;

  telemetry.trackCliOptionProject(parsedArgs.flags['--project']);
  const scope = await resolveCommentsScope(client, {
    project: parsedArgs.flags['--project'],
    requireProject: false,
    jsonOutput: false,
    urlTeamSlug: threadRef.teamSlug,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  let webUrl: string | undefined;
  try {
    const thread = await getThread(client, scope.teamId, threadId);
    webUrl = thread.webUrl;
  } catch (err) {
    if (isAPIError(err)) {
      const { code, message } = toApiErrorParts(err);
      return outputError(
        client,
        false,
        code,
        err.status === 404 ? threadNotFoundMessage(threadId, scope) : message
      );
    }
    throw err;
  }

  if (!webUrl) {
    output.error(`The API returned no web URL for ${threadId}.`);
    return 1;
  }

  output.log(`Opening ${webUrl}`);
  await open(webUrl);
  return 0;
}
