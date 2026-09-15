import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import cmd from '../../util/output/cmd';
import getScope from '../../util/get-scope';
import sleep from '../../util/sleep';
import { printError } from '../../util/error';
import {
  OmniagentApi,
  OmniagentApiError,
  type SessionSnapshot,
} from './omniagent-api';
import { consumeTurnStream, type AskOutputMode } from './stream';

const POLL_INTERVAL_MS = 2000;
const PENDING_TURN_STATES = new Set(['queued', 'running']);

export interface AskOptions {
  prompt: string | undefined;
  sessionId: string | undefined;
  noWait: boolean;
  verbose: boolean;
  json: boolean;
}

export default async function ask(
  client: Client,
  options: AskOptions
): Promise<number> {
  const { prompt, sessionId, noWait } = options;

  if (options.verbose && options.json) {
    output.error('The `--verbose` and `--json` options cannot be combined.');
    return 1;
  }
  if (!prompt && !sessionId) {
    output.error(
      `Provide a prompt, for example ${cmd('vercel ask "Why did my last deployment fail?"')}.`
    );
    return 1;
  }
  if (noWait && !prompt) {
    output.error('The `--no-wait` option requires a prompt.');
    return 1;
  }

  const mode: AskOutputMode = options.json
    ? 'json'
    : options.verbose
      ? 'verbose'
      : 'text';

  const api = new OmniagentApi(client);

  try {
    if (!prompt && sessionId) {
      return await checkSession(client, api, { sessionId, mode });
    }

    return await sendPrompt(client, api, {
      prompt: prompt as string,
      sessionId,
      noWait,
      mode,
    });
  } catch (error) {
    output.stopSpinner();
    if (error instanceof OmniagentApiError) {
      output.error(error.message);
      return 1;
    }
    printError(error);
    return 1;
  }
}

async function sendPrompt(
  client: Client,
  api: OmniagentApi,
  opts: {
    prompt: string;
    sessionId: string | undefined;
    noWait: boolean;
    mode: AskOutputMode;
  }
): Promise<number> {
  const { mode } = opts;
  let sessionId = opts.sessionId;
  let teamId: string | undefined;

  if (!sessionId) {
    // A team scope is required to create a session. This also refreshes the
    // CLI access token before it is used against the agent API.
    const { team } = await getScope(client);
    if (!team) {
      output.error(
        `Vercel Agent sessions require a team scope. Run ${cmd('vercel switch')} or pass ${cmd('--scope <team>')}.`
      );
      return 1;
    }
    teamId = team.id;

    if (mode !== 'json') {
      output.spinner('Creating agent session…');
    }
    const created = await api.createSession(teamId);
    sessionId = created.sessionId;
  }

  if (mode === 'json') {
    client.stdout.write(`${JSON.stringify({ type: 'session', sessionId })}\n`);
  } else {
    output.spinner(
      opts.noWait ? 'Dispatching to Vercel Agent…' : 'Waiting for Vercel Agent…'
    );
  }

  const response = await api.startTurn(sessionId, {
    prompt: opts.prompt,
    // Only needed when the turn creates the session envelope.
    teamId,
  });

  const result = await consumeTurnStream(response, {
    client,
    mode,
    stopAfterStart: opts.noWait,
  });

  if (result.status === 'dispatched') {
    if (mode === 'json') {
      client.stdout.write(
        `${JSON.stringify({ type: 'dispatched', sessionId })}\n`
      );
    } else {
      client.stdout.write(`${sessionId}\n`);
      output.log(`Dispatched to Vercel Agent.`);
      output.log(
        `Check the answer: ${cmd(`vercel ask --session ${sessionId}`)}`
      );
    }
    return 0;
  }

  if (result.status === 'error' || result.status === 'incomplete') {
    output.error(result.errorText ?? 'The agent turn failed.');
    printSessionHint(sessionId);
    return 1;
  }

  printSessionHint(sessionId);
  return 0;
}

async function checkSession(
  client: Client,
  api: OmniagentApi,
  opts: { sessionId: string; mode: AskOutputMode }
): Promise<number> {
  const { sessionId, mode } = opts;

  if (mode !== 'json') {
    output.spinner('Waiting for Vercel Agent…');
  }

  let snapshot = await api.getSession(sessionId);
  while (
    snapshot.lastTurn &&
    PENDING_TURN_STATES.has(snapshot.lastTurn.state)
  ) {
    await sleep(POLL_INTERVAL_MS);
    snapshot = await api.getSession(sessionId);
  }
  output.stopSpinner();

  if (mode === 'json') {
    client.stdout.write(`${JSON.stringify(snapshot)}\n`);
    return snapshot.lastTurn?.state === 'failed' ? 1 : 0;
  }

  const answerText = getLastAssistantText(snapshot);
  if (!snapshot.lastTurn && !answerText) {
    output.log('The agent has not responded in this session yet.');
    printSessionHint(sessionId);
    return 0;
  }

  if (answerText) {
    client.stdout.write(
      answerText.endsWith('\n') ? answerText : `${answerText}\n`
    );
  }

  if (snapshot.lastTurn?.state === 'failed') {
    output.error('The agent turn failed.');
    printSessionHint(sessionId);
    return 1;
  }
  if (snapshot.lastTurn?.state === 'interrupted') {
    output.warn('The agent turn was interrupted.');
  }

  printSessionHint(sessionId);
  return 0;
}

function getLastAssistantText(snapshot: SessionSnapshot): string {
  for (let i = snapshot.messages.length - 1; i >= 0; i--) {
    const message = snapshot.messages[i];
    if (message.role !== 'assistant') {
      continue;
    }
    return message.parts
      .filter(part => part.type === 'text' && typeof part.text === 'string')
      .map(part => part.text)
      .join('\n\n');
  }
  return '';
}

function printSessionHint(sessionId: string): void {
  output.print('\n');
  output.log(`Session ${chalk.bold(sessionId)}`);
  output.log(
    `Continue: ${cmd(`vercel ask --session ${sessionId} "<prompt>"`)}`
  );
}
