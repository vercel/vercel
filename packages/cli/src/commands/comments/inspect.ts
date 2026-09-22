import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { canPrompt } from '../../util/can-prompt';
import { validateJsonOutput } from '../../util/output-format';
import { outputError } from '../../util/command-validation';
import type { CommentsTelemetryClient } from '../../util/telemetry/commands/comments';
import { inspectSubcommand } from './command';
import { handleCommentsParseError, threadNotFoundMessage } from './errors';
import {
  getThread,
  listMessages,
  listThreads,
  isAPIError,
  toApiErrorParts,
} from './api';
import { resolveCommentsScope, inferBranch } from './scope';
import { parseThreadArg } from './threads';
import {
  actorLabel,
  displayPath,
  renderThreadDetail,
  threadAge,
  truncate,
} from './format';
import type { CommentMessage, Thread } from './types';

async function pickThread(
  client: Client,
  jsonOutput: boolean
): Promise<string | number> {
  // Machine and non-TTY modes never prompt. Return a deterministic error
  // instead of invoking the picker against a non-interactive stdin.
  if (!canPrompt(client) || jsonOutput) {
    return outputError(
      client,
      jsonOutput,
      'MISSING_THREAD',
      'Pass a thread ID or URL: `vercel comments inspect <thread>`.'
    );
  }

  // The picker runs exactly the default list query: linked project scope,
  // unresolved, current-branch focus — first page only, no probe.
  const scope = await resolveCommentsScope(client, {
    requireProject: true,
    jsonOutput,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  const focus = scope.linked ? inferBranch(client.cwd) : undefined;
  output.spinner('Fetching comments…');
  let response;
  try {
    response = await listThreads(client, scope.teamId, {
      projectId: scope.projectId,
      status: 'unresolved',
      branch: focus ? [focus.value] : undefined,
      limit: 20,
    });
  } finally {
    output.stopSpinner();
  }

  if (response.threads.length === 0) {
    return outputError(
      client,
      jsonOutput,
      'NO_COMMENTS',
      `No unresolved comments${focus ? ` on ${focus.value}` : ''} to pick from.`
    );
  }

  return client.input.select({
    message: 'Select a comment',
    choices: response.threads.map(thread => ({
      name: `${threadAge(thread)}  ${actorLabel(thread.messages[0]?.author)}  ${displayPath(thread)}  “${truncate(thread.messages[0]?.text ?? '', 48)}”`,
      value: thread.id,
    })),
  });
}

async function fetchAllMessages(
  client: Client,
  teamId: string,
  thread: Thread
): Promise<CommentMessage[]> {
  if (thread.messageCount <= thread.messages.length) {
    return thread.messages;
  }
  // More messages than the embedded window: ignore the embedded array and
  // fetch the complete list — no merging, no dedup.
  const all: CommentMessage[] = [];
  let cursor: string | undefined;
  do {
    const page = await listMessages(client, teamId, thread.id, {
      limit: 100,
      cursor,
    });
    all.push(...page.messages);
    cursor = page.pagination?.nextCursor;
  } while (cursor && all.length < thread.messageCount);
  return all;
}

export default async function inspect(
  client: Client,
  telemetry: CommentsTelemetryClient
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(inspectSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    return handleCommentsParseError(err, 'inspect');
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const jsonOutput = formatResult.jsonOutput;
  const showContext = Boolean(parsedArgs.flags['--context']);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);
  telemetry.trackCliFlagContext(parsedArgs.flags['--context']);
  telemetry.trackCliOptionProject(parsedArgs.flags['--project']);

  const threadInput = parsedArgs.args[2];
  telemetry.trackCliArgumentThread(threadInput);

  let threadId: string;
  let urlTeamSlug: string | undefined;
  if (threadInput) {
    const parsed = parseThreadArg(threadInput);
    if (!parsed) {
      return outputError(
        client,
        jsonOutput,
        'INVALID_THREAD',
        `Could not extract a thread ID from "${threadInput}". Pass the thread ID or its vercel.com URL.`
      );
    }
    threadId = parsed.id;
    urlTeamSlug = parsed.teamSlug;
  } else {
    const picked = await pickThread(client, jsonOutput);
    if (typeof picked === 'number') {
      return picked;
    }
    threadId = picked;
  }

  const scope = await resolveCommentsScope(client, {
    project: parsedArgs.flags['--project'],
    requireProject: false,
    jsonOutput,
    urlTeamSlug,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  if (!jsonOutput) {
    output.spinner('Fetching comment…');
  }
  let thread: Thread;
  let messages: CommentMessage[];
  try {
    thread = await getThread(client, scope.teamId, threadId);
    messages = await fetchAllMessages(client, scope.teamId, thread);
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

  if (jsonOutput) {
    client.stdout.write(
      `${JSON.stringify({ ...thread, messages }, null, 2)}\n`
    );
    return 0;
  }

  output.print(`${renderThreadDetail(thread, messages, { showContext })}\n`);
  return 0;
}
