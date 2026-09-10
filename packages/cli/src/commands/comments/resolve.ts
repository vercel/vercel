import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { canPrompt } from '../../util/can-prompt';
import { validateJsonOutput } from '../../util/output-format';
import { outputError } from '../../util/command-validation';
import type { CommentsTelemetryClient } from '../../util/telemetry/commands/comments';
import { resolveSubcommand, reopenSubcommand } from './command';
import { handleCommentsParseError, threadNotFoundMessage } from './errors';
import { addMessage, updateThread, isAPIError, toApiErrorParts } from './api';
import { resolveCommentsScope } from './scope';
import { parseThreadArg } from './threads';

interface ThreadResult {
  id: string;
  ok: boolean;
  error?: string;
}

export default async function resolveThreads(
  client: Client,
  telemetry: CommentsTelemetryClient,
  resolved: boolean
): Promise<number> {
  const subcommand = resolved ? resolveSubcommand : reopenSubcommand;
  const verb = resolved ? 'resolve' : 'reopen';
  const pastVerb = resolved ? 'resolved' : 'reopened';

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
  const closingMessage: string | undefined = resolved
    ? (parsedArgs.flags as { '--message'?: string })['--message']
    : undefined;
  const yes = Boolean(parsedArgs.flags['--yes']);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);
  telemetry.trackCliFlagYes(parsedArgs.flags['--yes']);
  if (resolved) {
    telemetry.trackCliOptionMessage(closingMessage);
  }

  const threadInputs = parsedArgs.args.slice(2);
  telemetry.trackCliArgumentThread(threadInputs[0]);
  if (threadInputs.length === 0) {
    return outputError(
      client,
      jsonOutput,
      'MISSING_THREAD',
      `Pass at least one thread ID or URL: \`vercel comments ${verb} <thread>\`.`
    );
  }

  const threadIds: string[] = [];
  let urlTeamSlug: string | undefined;
  for (const input of threadInputs) {
    const ref = parseThreadArg(input);
    if (!ref) {
      return outputError(
        client,
        jsonOutput,
        'INVALID_THREAD',
        `Could not extract a thread ID from "${input}".`
      );
    }
    if (ref.teamSlug) {
      if (urlTeamSlug && urlTeamSlug !== ref.teamSlug) {
        return outputError(
          client,
          jsonOutput,
          'MIXED_TEAMS',
          `The URLs belong to different teams (${urlTeamSlug}, ${ref.teamSlug}). Run once per team.`
        );
      }
      urlTeamSlug = ref.teamSlug;
    }
    threadIds.push(ref.id);
  }

  if (closingMessage !== undefined && threadIds.length > 1) {
    return outputError(
      client,
      jsonOutput,
      'MESSAGE_WITH_MULTIPLE_THREADS',
      'Cannot use -m with multiple threads. Resolve one thread with a closing message, or resolve multiple threads without -m.'
    );
  }

  const scope = await resolveCommentsScope(client, {
    project: (parsedArgs.flags as { '--project'?: string })['--project'],
    requireProject: false,
    jsonOutput,
    urlTeamSlug,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  if (threadIds.length > 1 && !yes) {
    if (!canPrompt(client) || jsonOutput) {
      return outputError(
        client,
        jsonOutput,
        'CONFIRMATION_REQUIRED',
        `Pass --yes to ${verb} ${threadIds.length} comments non-interactively.`
      );
    }
    const confirmed = await client.input.confirm(
      `${chalk.bold(String(threadIds.length))} comments will be ${pastVerb} in team ${scope.teamSlug ?? scope.teamId}. Continue?`,
      false
    );
    if (!confirmed) {
      output.log('Canceled.');
      return 0;
    }
  }

  telemetry.trackCliOptionProject(
    (parsedArgs.flags as { '--project'?: string })['--project']
  );
  // Single thread with an optional closing reply: reply first, then resolve.
  // The only possible half-state is replied-but-unresolved.
  if (threadIds.length === 1) {
    const threadId = threadIds[0];
    let replied = false;
    try {
      if (closingMessage !== undefined) {
        await addMessage(client, scope.teamId, threadId, {
          markdown: closingMessage,
        });
        replied = true;
      }
      const thread = await updateThread(
        client,
        scope.teamId,
        threadId,
        resolved
      );

      if (jsonOutput) {
        client.stdout.write(
          `${JSON.stringify({ thread, replied }, null, 2)}\n`
        );
        return 0;
      }
      output.print(
        `${chalk.green('✓')} ${threadId} ${pastVerb}${replied ? ' (with closing reply)' : ''}\n`
      );
      return 0;
    } catch (err) {
      if (isAPIError(err)) {
        const { code, message } = toApiErrorParts(err);
        const friendly =
          err.status === 404 ? threadNotFoundMessage(threadId, scope) : message;
        return outputError(
          client,
          jsonOutput,
          code,
          replied
            ? `Replied, but ${verb} failed: ${friendly} Run \`vercel comments resolve ${threadId}\` (without -m) to finish without duplicating the reply.`
            : friendly
        );
      }
      throw err;
    }
  }

  // Bulk: continue past failures, report per thread, exit 1 on any failure.
  const results: ThreadResult[] = [];
  for (const threadId of threadIds) {
    try {
      await updateThread(client, scope.teamId, threadId, resolved);
      results.push({ id: threadId, ok: true });
    } catch (err) {
      if (isAPIError(err)) {
        const { message } = toApiErrorParts(err);
        results.push({ id: threadId, ok: false, error: message });
      } else {
        throw err;
      }
    }
  }

  const failed = results.filter(result => !result.ok);

  if (jsonOutput) {
    client.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
    return failed.length > 0 ? 1 : 0;
  }

  for (const result of results) {
    if (result.ok) {
      output.print(`${chalk.green('✓')} ${result.id} ${pastVerb}\n`);
    } else {
      // Nonfatal to the batch (the run continues past failures); the
      // overall error state is carried by the exit code below.
      output.print(`${chalk.yellow('!')} ${result.id} ${result.error}\n`);
    }
  }
  return failed.length > 0 ? 1 : 0;
}
