import { createHash } from 'node:crypto';
import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import ask from '../../../../src/commands/ask';

const SESSION_ID = 'f1e2d3c4-0000-0000-0000-000000000000';

function useTeamScope() {
  useUser();
  useTeams('team_dummy');
  client.config.currentTeam = 'team_dummy';
}

function useCreateSession() {
  const requests: Array<Record<string, unknown>> = [];
  client.scenario.post('/api/sessions', (req: Request, res: Response) => {
    requests.push(req.body);
    res.json({ sessionId: SESSION_ID, url: `/sessions/${SESSION_ID}` });
  });
  return requests;
}

function useTurnStream(
  parts: Array<Record<string, unknown>>,
  opts: { holdOpen?: boolean } = {}
) {
  const requests: Array<Record<string, unknown>> = [];
  client.scenario.post(
    `/api/sessions/${SESSION_ID}`,
    (req: Request, res: Response) => {
      requests.push(req.body);
      res.setHeader('content-type', 'text/event-stream');
      for (const part of parts) {
        res.write(`data: ${JSON.stringify(part)}\n\n`);
      }
      if (opts.holdOpen) {
        // Keep the connection open until the client cancels the stream
        // (exercises the --no-wait early exit).
        req.on('close', () => res.end());
      } else {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    }
  );
  return requests;
}

function useSessionSnapshot(
  snapshots: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const remaining = [...snapshots];
  client.scenario.get(
    `/api/sessions/${SESSION_ID}`,
    (_req: Request, res: Response) => {
      const snapshot = remaining.length > 1 ? remaining.shift() : remaining[0];
      res.json(snapshot);
    }
  );
  return remaining;
}

const answerParts = [
  { type: 'start', messageId: 'msg_1' },
  { type: 'start-step' },
  { type: 'text-start', id: 'txt_1' },
  { type: 'text-delta', id: 'txt_1', delta: 'Your deployment failed ' },
  { type: 'text-delta', id: 'txt_1', delta: 'because of a build error.' },
  { type: 'text-end', id: 'txt_1' },
  { type: 'finish-step' },
  { type: 'finish' },
];

describe('ask', () => {
  beforeEach(() => {
    client.reset();
    process.env.VERCEL_OMNIAGENT_URL = client.apiUrl;
  });

  afterEach(() => {
    delete process.env.VERCEL_OMNIAGENT_URL;
    delete process.env.VERCEL_SSO_API_URL;
  });

  it('completes the deployment protection SSO handshake on a 401 challenge', async () => {
    useTeamScope();
    process.env.VERCEL_SSO_API_URL = `${client.apiUrl}/sso-api`;

    const NONCE = 'nonce123';
    const JWT = 'jwt456';
    const protectionCookie = `_vercel_sso_nonce=${NONCE}; _vercel_jwt=${JWT}`;
    const seenCookies: Array<string | undefined> = [];
    let ssoRequest: { url?: string; nonce?: string; cookie?: string } = {};

    client.scenario.post('/api/sessions', (req: Request, res: Response) => {
      seenCookies.push(req.headers.cookie);
      if (req.headers.cookie !== protectionCookie) {
        // Vercel deployment protection answers requests with an
        // Authorization header using a 401 challenge (not a 302).
        res.setHeader(
          'set-cookie',
          `_vercel_sso_nonce=${NONCE}; Max-Age=3600; Path=/; Secure; HttpOnly`
        );
        res.status(401).send('Authentication Required');
        return;
      }
      res.json({ sessionId: SESSION_ID, url: `/sessions/${SESSION_ID}` });
    });
    client.scenario.get('/sso-api', (req: Request, res: Response) => {
      ssoRequest = {
        url: req.query.url as string,
        nonce: req.query.nonce as string,
        cookie: req.headers.cookie as string,
      };
      res.redirect(302, `${client.apiUrl}/api/sessions?_vercel_jwt=${JWT}`);
    });
    useTurnStream(answerParts);

    client.setArgv('ask', 'Hello through protection');
    const exitCode = await ask(client);

    expect(exitCode).toBe(0);
    // First request is challenged, the retry carries the handshake cookies.
    expect(seenCookies).toEqual([undefined, protectionCookie]);
    expect(ssoRequest.url).toBe(`${client.apiUrl}/api/sessions`);
    expect(ssoRequest.nonce).toBe(
      createHash('sha256').update(NONCE).digest('hex')
    );
    expect(ssoRequest.cookie).toContain('authorization=Bearer%20token_dummy');
    expect(client.stdout.getFullOutput()).toBe(
      'Your deployment failed because of a build error.\n'
    );
  });

  it('creates a session, streams the answer, and prints a continuation hint', async () => {
    useTeamScope();
    const sessionRequests = useCreateSession();
    const turnRequests = useTurnStream(answerParts);

    client.setArgv('ask', 'Why did my last deployment fail?');
    const exitCode = await ask(client);

    expect(exitCode).toBe(0);
    expect(sessionRequests).toEqual([
      { teamId: 'team_dummy', surface: 'dashboard' },
    ]);
    expect(turnRequests).toEqual([
      {
        type: 'message',
        message: 'Why did my last deployment fail?',
        teamId: 'team_dummy',
      },
    ]);
    expect(client.stdout.getFullOutput()).toBe(
      'Your deployment failed because of a build error.\n'
    );
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(`Session ${SESSION_ID}`);
    expect(stderr).toContain(`vercel ask --session ${SESSION_ID}`);
  });

  it('outputs the turn as JSON Lines with --json', async () => {
    useTeamScope();
    useCreateSession();
    useTurnStream(answerParts);

    client.setArgv('ask', '--json', 'What happened?');
    const exitCode = await ask(client);

    expect(exitCode).toBe(0);
    const lines = client.stdout
      .getFullOutput()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    expect(lines[0]).toEqual({ type: 'session', sessionId: SESSION_ID });
    expect(lines.slice(1)).toEqual(answerParts);
  });

  it('renders reasoning and tool activity with --verbose', async () => {
    useTeamScope();
    useCreateSession();
    useTurnStream([
      { type: 'start', messageId: 'msg_1' },
      { type: 'reasoning-start', id: 'r_1' },
      { type: 'reasoning-delta', id: 'r_1', delta: 'Inspecting the build…' },
      { type: 'reasoning-end', id: 'r_1' },
      {
        type: 'tool-input-available',
        toolCallId: 'call_1',
        toolName: 'getDeploymentLogs',
        input: { deploymentId: 'dpl_123' },
      },
      {
        type: 'tool-output-available',
        toolCallId: 'call_1',
        output: { ok: true },
      },
      { type: 'text-start', id: 'txt_1' },
      { type: 'text-delta', id: 'txt_1', delta: 'All good.' },
      { type: 'text-end', id: 'txt_1' },
      { type: 'finish' },
    ]);

    client.setArgv('ask', '--verbose', 'Check my logs');
    const exitCode = await ask(client);

    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput()).toBe('All good.\n');
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Inspecting the build…');
    expect(stderr).toContain('getDeploymentLogs');
    expect(stderr).toContain('dpl_123');
  });

  it('sends the prompt into an existing session with --session', async () => {
    useTeamScope();
    const sessionRequests = useCreateSession();
    const turnRequests = useTurnStream(answerParts);

    client.setArgv('ask', '--session', SESSION_ID, 'Can you fix it?');
    const exitCode = await ask(client);

    expect(exitCode).toBe(0);
    expect(sessionRequests).toEqual([]);
    expect(turnRequests).toEqual([
      { type: 'message', message: 'Can you fix it?' },
    ]);
    expect(client.stdout.getFullOutput()).toBe(
      'Your deployment failed because of a build error.\n'
    );
  });

  it('dispatches without waiting with --no-wait', async () => {
    useTeamScope();
    useCreateSession();
    useTurnStream([{ type: 'start', messageId: 'msg_1' }], {
      holdOpen: true,
    });

    client.setArgv('ask', '--no-wait', 'Audit my project');
    const exitCode = await ask(client);

    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput()).toBe(`${SESSION_ID}\n`);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Dispatched to Vercel Agent.');
    expect(stderr).toContain(`vercel ask --session ${SESSION_ID}`);
  });

  it('emits a dispatched JSON line with --no-wait --json', async () => {
    useTeamScope();
    useCreateSession();
    useTurnStream([{ type: 'start', messageId: 'msg_1' }], {
      holdOpen: true,
    });

    client.setArgv('ask', '--no-wait', '--json', 'Audit my project');
    const exitCode = await ask(client);

    expect(exitCode).toBe(0);
    const lines = client.stdout
      .getFullOutput()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    expect(lines[0]).toEqual({ type: 'session', sessionId: SESSION_ID });
    expect(lines[lines.length - 1]).toEqual({
      type: 'dispatched',
      sessionId: SESSION_ID,
    });
  });

  it('returns 1 when the turn stream reports an error', async () => {
    useTeamScope();
    useCreateSession();
    useTurnStream([
      { type: 'start', messageId: 'msg_1' },
      { type: 'error', errorText: 'The agent exploded' },
      { type: 'finish' },
    ]);

    client.setArgv('ask', 'Trigger an error');
    const exitCode = await ask(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('The agent exploded');
  });

  it('returns 1 and prints the API error when the turn request fails', async () => {
    useTeamScope();
    useCreateSession();
    client.scenario.post(
      `/api/sessions/${SESSION_ID}`,
      (_req: Request, res: Response) => {
        res.status(403).json({ error: 'Access denied to this team' });
      }
    );

    client.setArgv('ask', 'Hello');
    const exitCode = await ask(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Access denied to this team'
    );
  });

  it('prints the latest answer for a settled session with --session and no prompt', async () => {
    useTeamScope();
    useSessionSnapshot([
      {
        id: SESSION_ID,
        lastTurn: { assistantMessageId: 'msg_2', state: 'completed' },
        messages: [
          { id: 'msg_1', role: 'user', parts: [{ type: 'text', text: 'Q' }] },
          {
            id: 'msg_2',
            role: 'assistant',
            parts: [
              { type: 'reasoning', text: 'hidden' },
              { type: 'text', text: 'The answer is 42.' },
            ],
          },
        ],
        streamingMessageId: null,
        title: null,
      },
    ]);

    client.setArgv('ask', '--session', SESSION_ID);
    const exitCode = await ask(client);

    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput()).toBe('The answer is 42.\n');
  });

  it('polls until a running turn settles with --session and no prompt', async () => {
    useTeamScope();
    const runningSnapshot = {
      id: SESSION_ID,
      lastTurn: { assistantMessageId: 'msg_2', state: 'running' },
      messages: [],
      streamingMessageId: 'msg_2',
      title: null,
    };
    const completedSnapshot = {
      id: SESSION_ID,
      lastTurn: { assistantMessageId: 'msg_2', state: 'completed' },
      messages: [
        {
          id: 'msg_2',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Done after polling.' }],
        },
      ],
      streamingMessageId: null,
      title: null,
    };
    useSessionSnapshot([runningSnapshot, completedSnapshot]);

    client.setArgv('ask', '--session', SESSION_ID);
    const exitCode = await ask(client);

    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput()).toBe('Done after polling.\n');
  }, 15000);

  it('returns 1 when checking a session whose last turn failed', async () => {
    useTeamScope();
    useSessionSnapshot([
      {
        id: SESSION_ID,
        lastTurn: { assistantMessageId: 'msg_2', state: 'failed' },
        messages: [],
        streamingMessageId: null,
        title: null,
      },
    ]);

    client.setArgv('ask', '--session', SESSION_ID);
    const exitCode = await ask(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('The agent turn failed.');
  });

  it('errors when no prompt and no session are provided', async () => {
    client.setArgv('ask');
    const exitCode = await ask(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Provide a prompt');
  });

  it('errors when --no-wait is used without a prompt', async () => {
    client.setArgv('ask', '--no-wait', '--session', SESSION_ID);
    const exitCode = await ask(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      '`--no-wait` option requires a prompt'
    );
  });

  it('errors when --verbose and --json are combined', async () => {
    client.setArgv('ask', '--verbose', '--json', 'Hello');
    const exitCode = await ask(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      '`--verbose` and `--json` options cannot be combined'
    );
  });

  it('errors when there is no team scope', async () => {
    useUser();
    client.setArgv('ask', 'Hello');
    const exitCode = await ask(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Vercel Agent sessions require a team scope'
    );
  });

  it('prints help with --help', async () => {
    client.setArgv('ask', '--help');
    const exitCode = await ask(client);
    expect(exitCode).toBe(2);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'ask' },
    ]);
  });

  it('tracks telemetry for the prompt and flags', async () => {
    useTeamScope();
    useCreateSession();
    useTurnStream(answerParts);

    client.setArgv('ask', '--json', 'What happened?');
    const exitCode = await ask(client);

    expect(exitCode).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'argument:prompt', value: '[REDACTED]' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });
});
