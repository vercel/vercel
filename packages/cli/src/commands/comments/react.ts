import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import getScope from '../../util/get-scope';
import { validateJsonOutput } from '../../util/output-format';
import { outputError } from '../../util/command-validation';
import type { CommentsTelemetryClient } from '../../util/telemetry/commands/comments';
import { reactSubcommand, unreactSubcommand } from './command';
import { handleCommentsParseError, threadNotFoundMessage } from './errors';
import {
  addReaction,
  removeReaction,
  getThread,
  listEmojis,
  isAPIError,
  toApiErrorParts,
} from './api';
import { resolveCommentsScope } from './scope';
import { parseThreadArg } from './threads';
import type { Thread } from './types';

async function suggestEmojiNames(
  client: Client,
  teamId: string,
  name: string
): Promise<string | undefined> {
  try {
    const { emojis } = await listEmojis(client, teamId, name);
    if (emojis.length === 0) {
      return undefined;
    }
    return emojis
      .slice(0, 5)
      .map(entry => `  ${entry.emoji}  ${entry.name}`)
      .join('\n');
  } catch {
    return undefined;
  }
}

function findLatestMessageWithCallerReaction(
  thread: Thread,
  name: string,
  userId: string
): string | undefined {
  for (let i = thread.messages.length - 1; i >= 0; i--) {
    const message = thread.messages[i];
    const match = message.reactions?.some(
      reaction =>
        reaction.name === name &&
        reaction.users.some(user => user.id === userId)
    );
    if (match) {
      return message.id;
    }
  }
  return undefined;
}

export default async function react(
  client: Client,
  telemetry: CommentsTelemetryClient,
  remove: boolean
): Promise<number> {
  const subcommand = remove ? unreactSubcommand : reactSubcommand;

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(subcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    return handleCommentsParseError(err, subcommand.name);
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const jsonOutput = formatResult.jsonOutput;
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);
  telemetry.trackCliOptionMessageId(parsedArgs.flags['--message-id']);

  const [threadInput, name] = parsedArgs.args.slice(2);
  telemetry.trackCliArgumentThread(threadInput);
  telemetry.trackCliArgumentName(name);
  if (!threadInput || !name) {
    return outputError(
      client,
      jsonOutput,
      'MISSING_ARGUMENT',
      `Usage: \`vercel comments ${subcommand.name} <thread> <name>\` — reactions take names (e.g. white_check_mark); run \`vercel comments emojis <search>\` to find one.`
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

  let messageId = parsedArgs.flags['--message-id'] as string | undefined;
  try {
    if (!messageId) {
      const thread = await getThread(client, scope.teamId, threadId);
      if (remove) {
        // The right default for removal is the caller's most recent matching
        // reaction (searched within the embedded last-50 messages), not the
        // latest message — replies move the latest message away from it.
        const { user } = await getScope(client);
        messageId = findLatestMessageWithCallerReaction(thread, name, user.id);
        if (!messageId) {
          return outputError(
            client,
            jsonOutput,
            'REACTION_NOT_FOUND',
            `No "${name}" reaction of yours found in the ${thread.messages.length} most recent messages. Pass --message <id> (see \`vercel comments inspect ${threadId}\`).`
          );
        }
      } else {
        messageId = thread.messages[thread.messages.length - 1]?.id;
        if (!messageId) {
          return outputError(
            client,
            jsonOutput,
            'NO_MESSAGES',
            `Thread ${threadId} has no messages to react to.`
          );
        }
      }
    }

    const message = remove
      ? await removeReaction(client, scope.teamId, threadId, messageId, name)
      : await addReaction(client, scope.teamId, threadId, messageId, name);

    if (jsonOutput) {
      client.stdout.write(`${JSON.stringify(message, null, 2)}\n`);
      return 0;
    }
    output.success(
      remove
        ? `Removed ${name} from ${threadId}`
        : `Reacted with ${name} to ${threadId}`
    );
    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      const { code, message } = toApiErrorParts(err);
      if (err.status === 404) {
        // A 404 here is the thread (or message), not the emoji name.
        return outputError(
          client,
          jsonOutput,
          code,
          threadNotFoundMessage(threadId, scope)
        );
      }
      if (err.status === 400) {
        const suggestions = await suggestEmojiNames(client, scope.teamId, name);
        if (suggestions && !jsonOutput) {
          output.error(`${message}\nClose matches:\n${suggestions}`);
          return 1;
        }
      }
      return outputError(client, jsonOutput, code, message);
    }
    throw err;
  }
}
