import type Client from '../../util/client';
import type { AgentFlags } from './flags';
import type { Meta } from './meta';
import type { Target } from './session';
import type { TurnInput, TurnOptions, TurnResult } from './turn';
import type { StreamChunk, ToolPart } from './types';
import process from 'node:process';
import {
  buildCommandWithGlobalFlags,
  shouldEmitNonInteractiveCommandError,
  writeActionRequired,
} from '../../util/agent-output';
import {
  AGENT_REASON,
  AGENT_STATUS,
  getExitCodeForReason,
} from '../../util/agent-output-constants';
import { sessionUrl } from './api';
import { toUserContext } from './context';
import { AgentError } from './errors';
import { formatPlan, summarizeTool } from './format';
import { looksLikeProject } from './link';
import { createMeta, formatAge } from './meta';
import {
  findRecentSession,
  recentKey,
  recentSessionsFile,
  rememberSession,
} from './recent';
import { resolveTarget } from './session';
import { finalText, findPendingApproval, isToolPart, toolName } from './stream';
import { consumeStream, runTurn } from './turn';

const INTERRUPTED = 130;

/** Progress lines on stderr: preamble status and one line per tool call. */
function progressReporter(
  meta: Meta
): (chunk: StreamChunk, state: TurnResult['state']) => void {
  let printed = false;
  return (chunk, state) => {
    // The preamble streams word by word; print its final form once the real reply starts.
    if (!printed && chunk.type !== 'data-preamble' && state.preamble) {
      printed = true;
      meta.status(state.preamble);
    }
    if (
      chunk.type === 'tool-input-available' ||
      chunk.type === 'tool-input-error'
    ) {
      const part = state.message.parts.find(
        (p): p is ToolPart => isToolPart(p) && p.toolCallId === chunk.toolCallId
      );
      if (part) meta.tool(summarizeTool(part));
    }
    if (chunk.type === 'tool-output-error')
      meta.toolError(String(chunk.errorText ?? 'failed').split('\n')[0]!);
  };
}

/** The message to send: a prompt, a plan decision, or nothing (just look at the session). */
async function resolveInput(
  flags: AgentFlags,
  prompt: string,
  { api, context, session }: Target
): Promise<TurnInput | undefined> {
  if (prompt) return { text: prompt };
  if (!flags['--approve'] && !flags['--reject']) return undefined;
  const details = await api.getSession(context.team.id, session.id);
  const approval = findPendingApproval(details.messages);
  if (!approval)
    throw new AgentError(
      AGENT_REASON.NOT_FOUND,
      `No plan is waiting for approval in session ${session.id}.`
    );
  return {
    approval,
    approved: Boolean(flags['--approve']),
  };
}

/** No new input: attach to a running turn, or show where the session stands. */
async function inspectSession(
  { api, context, session }: Target,
  signal: AbortSignal,
  onChunk?: TurnOptions['onChunk']
): Promise<TurnResult> {
  const details = await api.getSession(context.team.id, session.id);
  const body = details.streamingMessageId
    ? await api.reconnect(context.team.id, session.id, signal)
    : null;
  if (body) return consumeStream(body, onChunk);
  const message = details.messages.findLast(m => m.role === 'assistant') ?? {
    id: '',
    role: 'assistant',
    parts: [],
  };
  const pending = findPendingApproval(details.messages);
  return {
    state: {
      message,
      title: details.title ?? undefined,
      aborted: false,
      streaming: new Map(),
    },
    status: pending ? 'approval-required' : 'done',
    pending,
  };
}

/**
 * A new prompt continues this project's last one-shot session when it is under 30 minutes old,
 * unless `--new`. Returns the target to use, and a note when it was resumed that way.
 */
function resumeRecent(
  target: Target,
  flags: AgentFlags,
  prompt: string
): { target: Target; note?: string; remember: () => void } {
  const file = recentSessionsFile();
  const key = recentKey(
    target.context.team.id,
    target.context.project?.id,
    target.client.cwd
  );
  let resolved = target;
  let note: string | undefined;
  const recent =
    target.session.isNew && !flags['--new'] && prompt
      ? findRecentSession(file, key)
      : undefined;
  if (recent) {
    resolved = {
      ...target,
      session: { id: recent.sessionId, isNew: false },
      url: sessionUrl(target.context.team.slug, recent.sessionId),
    };
    note = `resumed, last used ${formatAge(Date.now() - recent.usedAt)} · --new for a fresh session`;
  }
  return {
    target: resolved,
    note,
    remember: () => rememberSession(file, key, resolved.session.id),
  };
}

interface Report {
  client: Client;
  json: boolean;
  stream: boolean;
  meta: Meta;
  target: Target;
}

function exitCode({ status }: TurnResult, signal: AbortSignal): number {
  if (status === 'done') return 0;
  if (status === 'approval-required')
    return getExitCodeForReason(AGENT_REASON.CONFIRMATION_REQUIRED);
  return status === 'aborted' && signal.aborted ? INTERRUPTED : 1;
}

function report(
  { state, status, pending }: TurnResult,
  { client, json, stream, meta, target }: Report
): void {
  const text = finalText(state.message);
  const { session, url } = target;
  if (pending && (json || shouldEmitNonInteractiveCommandError(client))) {
    writeActionRequired(client, {
      status: AGENT_STATUS.ACTION_REQUIRED,
      reason: AGENT_REASON.CONFIRMATION_REQUIRED,
      message: `Vercel Agent proposed a plan that needs approval: ${pending.plan.title}`,
      userActionRequired: true,
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            `agent --session ${session.id} --approve`
          ),
          when: 'The user approves the plan',
        },
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            `agent --session ${session.id} --reject`
          ),
          when: 'The user rejects it',
        },
      ],
      data: {
        sessionId: session.id,
        url,
        plan: pending.plan,
        text,
      },
    });
    return;
  }
  if (json) {
    const toolCalls = state.message.parts.filter(isToolPart).map(p => ({
      name: toolName(p),
      state: p.state,
      input: p.input,
    }));
    const payload = state.error
      ? {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.API_ERROR,
          message: state.error,
          sessionId: session.id,
          url,
        }
      : {
          status: status === 'done' ? AGENT_STATUS.OK : status,
          sessionId: session.id,
          url,
          title: state.title,
          text,
          toolCalls,
        };
    client.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  if (!stream) {
    const blocks = [text, pending && formatPlan(pending.plan)].filter(Boolean);
    meta.separator();
    if (blocks.length) client.stdout.write(`${blocks.join('\n\n')}\n`);
  }
  if (state.error) meta.error(state.error);
  if (pending) meta.approval(session.id);
}

/** `vercel agent "<prompt>"`: one turn, with the answer on stdout and progress on stderr. */
export default async function ask(
  client: Client,
  flags: AgentFlags,
  prompt: string,
  json: boolean
): Promise<number> {
  const stream = Boolean(flags['--stream']);
  const meta = createMeta(
    text => client.stderr.write(text),
    Boolean(client.stderr.isTTY) && !process.env.NO_COLOR
  );
  const resolved = resumeRecent(
    await resolveTarget(client, {
      project: flags['--project'],
      session: flags['--session'],
      continue: flags['--continue'],
    }),
    flags,
    prompt
  );
  const { target } = resolved;
  const { api, context, session, url } = target;

  if (stream) {
    client.stdout.write(
      `${JSON.stringify({ type: 'session', sessionId: session.id, url })}\n`
    );
  } else {
    meta.header(
      [context.team.slug, context.project?.slug].filter(Boolean).join('/'),
      url,
      resolved.note
    );
    if (!context.project && !flags['--project'] && looksLikeProject(client.cwd))
      meta.hint(
        'No linked Vercel project here. Run `vercel link` to give the agent project context.'
      );
  }

  const controller = new AbortController();
  const onSigint = (): void => {
    controller.abort();
    api.interrupt(context.team.id, session.id).catch(() => {});
  };
  process.once('SIGINT', onSigint);
  try {
    let onChunk: TurnOptions['onChunk'];
    if (stream)
      onChunk = chunk => client.stdout.write(`${JSON.stringify(chunk)}\n`);
    else if (!json) onChunk = progressReporter(meta);
    const input = await resolveInput(flags, prompt, target);
    const result = input
      ? await runTurn({
          api,
          teamId: context.team.id,
          sessionId: session.id,
          isNew: session.isNew,
          input,
          userContext: toUserContext(context),
          signal: controller.signal,
          onChunk,
        })
      : await inspectSession(target, controller.signal, onChunk);
    if (input) resolved.remember();
    report(result, { client, json, stream, meta, target });
    return exitCode(result, controller.signal);
  } catch (error) {
    if (controller.signal.aborted) return INTERRUPTED;
    throw error;
  } finally {
    process.off('SIGINT', onSigint);
  }
}
