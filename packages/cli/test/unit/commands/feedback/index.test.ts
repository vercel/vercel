import stripAnsi from 'strip-ansi';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { client } from '../../../mocks/client';
import feedback, {
  FEEDBACK_URL,
  MAX_FEEDBACK_BYTES,
} from '../../../../src/commands/feedback';
import { feedbackCommand } from '../../../../src/commands/feedback/command';
import { commandsStructs } from '../../../../src/commands';
import { getRootHelpCommands } from '../../../../src/commands/root-help';
import { help } from '../../../../src/commands/help';
import { SUBCOMMANDS_WITHOUT_TOKEN } from '../../../../src/util/subcommands-without-token';
import pkg from '../../../../src/util/pkg';
import { TelemetryEventStore } from '../../../../src/util/telemetry';

describe('feedback', () => {
  let post: MockInstance<typeof fetch>;
  const telemetryEventStore = client.telemetryEventStore;

  beforeEach(() => {
    client.reset();
    vi.stubEnv('VERCEL_TELEMETRY_DISABLED', '');
    client.authConfig = {};
    post = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('{"success":true}'));
  });

  afterEach(() => {
    client.telemetryEventStore = telemetryEventStore;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  function submitted() {
    expect(post).toHaveBeenCalledTimes(1);
    const [url, options] = post.mock.calls[0];
    expect(url).toBe(FEEDBACK_URL);
    expect(options?.method).toBe('POST');
    expect(options?.redirect).toBe('manual');
    expect(new Headers(options?.headers).has('authorization')).toBe(false);
    expect(options?.signal).toBeDefined();
    return JSON.parse(options?.body as string);
  }

  async function expectFailure(code: number, message: string) {
    expect(await feedback(client)).toBe(code);
    expect(client.stdout.getFullOutput()).toBe('');
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(message);
    expect(stderr).not.toContain('private-');
  }

  it('shows discoverable help without submitting on a bare invocation', async () => {
    client.setArgv('feedback');
    expect(await feedback(client)).toBe(0);
    expect(stripAnsi(client.stdout.getFullOutput())).toContain(
      'vercel feedback [note] [options]'
    );
    expect(client.stderr.getFullOutput()).toBe('');
    expect(post).not.toHaveBeenCalled();
    expect(SUBCOMMANDS_WITHOUT_TOKEN).toContain('feedback');
    expect(commandsStructs).toContain(feedbackCommand);
    expect(
      getRootHelpCommands(commandsStructs).some(c =>
        c.names.includes('feedback')
      )
    ).toBe(true);
  });

  it('describes the recommended fields and uses them in the agent example', () => {
    const rendered = help(feedbackCommand, {
      stream: { isTTY: false },
      columns: 120,
    });
    expect(rendered).not.toContain('--json');
    expect(rendered).toContain('Fields (all optional)');
    const fields = [
      'type',
      'product',
      'model',
      'task',
      'expected',
      'actual',
      'impact',
    ];
    expect(feedbackCommand.helpSections[0].rows.map(row => row.syntax)).toEqual(
      fields
    );
    for (const field of fields) {
      expect(rendered).toMatch(new RegExp(`${field}\\s+\\S`));
      expect(feedbackCommand.examples.at(-1)?.value).toContain(
        `--field ${field}=`
      );
    }
    expect(rendered).not.toContain('--field harness=');
    expect(rendered).not.toContain('--field agent=');
  });

  it('includes metadata when telemetry is enabled', async () => {
    client.telemetryEventStore = new TelemetryEventStore({
      config: { enabled: true },
    });
    expect(client.telemetryEventStore.enabled).toBe(true);
    client.setArgv('feedback', 'Something would have helped');
    expect(await feedback(client)).toBe(0);
    expect(submitted()).toEqual({
      metadata: {
        agent: false,
        cli_version: pkg.version,
        operating_system: process.platform,
        user_id: null,
        team_id: null,
        invocation_id: client.telemetryEventStore.currentInvocationId,
        session_id: client.telemetryEventStore.currentSessionId,
      },
      data: { note: 'Something would have helped' },
    });
    expect(client.stdout.getFullOutput()).toBe('Feedback sent\n');
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it.each([
    'environment',
    'config',
  ])('sends null metadata when telemetry is disabled through %s', async source => {
    vi.stubEnv(
      'VERCEL_TELEMETRY_DISABLED',
      source === 'environment' ? '1' : ''
    );
    client.telemetryEventStore = new TelemetryEventStore({
      config: { enabled: source !== 'config' },
    });
    client.authConfig.userId = 'user_known';
    client.config.currentTeam = 'team_known';
    client.isAgent = true;
    client.agentName = 'opencode';
    expect(client.telemetryEventStore.enabled).toBe(false);
    client.setArgv('feedback', 'A note');
    expect(await feedback(client)).toBe(0);
    expect(submitted()).toEqual({
      metadata: null,
      data: { note: 'A note' },
    });
  });

  it.each([
    'flag',
    'config',
  ])('ignores the %s API origin and never sends credentials', async source => {
    client.authConfig.token = 'private-token';
    const origin = 'http://localhost:3000';
    if (source === 'config') client.config.api = origin;
    client.setArgv(
      'feedback',
      'A note',
      ...(source === 'flag' ? ['--api', origin] : [])
    );
    expect(await feedback(client)).toBe(0);
    expect(submitted().data).toEqual({ note: 'A note' });
  });

  it('submits fields alone as literal strings, splitting at the first equals sign', async () => {
    client.setArgv(
      'feedback',
      '-f',
      'task=deploy a preview',
      '--field',
      'expected=--not-prod',
      '-f',
      'url=https://example.com/?a=b',
      '-f',
      'flag=false',
      '-f',
      'empty=',
      '-f',
      'blank= \t ',
      '-f',
      'file=@notes.md'
    );
    expect(await feedback(client)).toBe(0);
    expect(submitted().data).toEqual({
      task: 'deploy a preview',
      expected: '--not-prod',
      url: 'https://example.com/?a=b',
      flag: 'false',
      file: '@notes.md',
    });
  });

  it('normalizes keys, omits blank values, and preserves nonblank values and special keys', async () => {
    client.setArgv(
      'feedback',
      '  A bug  ',
      '-f',
      'type=old',
      '-f',
      ' type =bug',
      '-f',
      'task= deploy a preview ',
      '-f',
      'impact=old',
      '-f',
      ' impact = \t ',
      '-f',
      '__proto__=literal',
      '-f',
      'constructor=literal'
    );
    expect(await feedback(client)).toBe(0);
    expect(submitted().data).toEqual(
      JSON.parse(
        '{"note":"  A bug  ","type":"bug","task":" deploy a preview ","__proto__":"literal","constructor":"literal"}'
      )
    );
  });

  it('includes local identity and detected agent metadata without replacing submitted fields', async () => {
    client.authConfig = { userId: 'user_known', token: 'private-token' };
    client.config.currentTeam = 'team_known';
    client.isAgent = true;
    client.agentName = 'opencode';
    client.setArgv('feedback', 'A note', '-f', 'agent=custom', '-f', 'model=');
    expect(await feedback(client)).toBe(0);
    expect(submitted()).toMatchObject({
      metadata: {
        agent: true,
        agent_name: 'opencode',
        user_id: 'user_known',
        team_id: 'team_known',
      },
      data: { note: 'A note', agent: 'custom' },
    });
  });

  it.each([
    [true, undefined],
    [false, 'opencode'],
  ])('omits the agent name for detected=%s and name=%s', async (detected, name) => {
    client.isAgent = detected;
    client.agentName = name;
    client.nonInteractive = true;
    client.setArgv(
      'feedback',
      '-f',
      'agent=opencode',
      '-f',
      'model=model',
      '-f',
      'harness=opencode'
    );
    expect(await feedback(client)).toBe(0);
    expect(submitted().metadata).toMatchObject({ agent: detected });
    expect(submitted().metadata).not.toHaveProperty('agent_name');
  });

  it.each([
    ['TTY', true, true, false],
    ['stdout redirected', true, false, false],
    ['stdin piped', false, true, false],
    ['non-interactive', true, true, true],
    ['CI', true, true, true],
    ['agent', true, true, true],
  ])('keeps success and failure streams clean in %s mode', async (mode, stdinTTY, stdoutTTY, nonInteractive) => {
    client.stdin.isTTY = stdinTTY;
    client.stdout.isTTY = stdoutTTY;
    client.nonInteractive = nonInteractive;
    client.isAgent = mode === 'agent';
    if (mode === 'CI') vi.stubEnv('CI', '1');
    client.setArgv('feedback', 'A note');
    expect(await feedback(client)).toBe(0);
    expect(client.stdout.getFullOutput()).toBe('Feedback sent\n');
    expect(client.stderr.getFullOutput()).toBe('');
    post.mockClear();
    post.mockResolvedValueOnce(
      new Response('private-response', { status: 503 })
    );
    expect(await feedback(client)).toBe(1);
    expect(client.stdout.getFullOutput()).toBe('Feedback sent\n');
    expect(client.stderr.getFullOutput()).toContain('HTTP 503');
    expect(client.stderr.getFullOutput()).not.toContain('private-response');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it.each([
    '\n',
    '\r\n',
  ])('reads UTF-8 stdin and removes one trailing %j', async newline => {
    client.stdin.isTTY = false;
    client.stdin.end(`A note 😕${newline}${newline}`);
    client.setArgv('feedback', '-', '-f', 'type=bug');
    expect(await feedback(client)).toBe(0);
    expect(submitted().data).toEqual({
      note: `A note 😕${newline}`,
      type: 'bug',
    });
  });

  it('accepts empty stdin with fields', async () => {
    client.stdin.isTTY = false;
    client.stdin.end('');
    client.setArgv('feedback', '-', '-f', 'impact=Missing docs');
    expect(await feedback(client)).toBe(0);
    expect(submitted().data).toEqual({ impact: 'Missing docs' });
  });

  it.each([
    { fields: [] },
    { fields: ['-f', 'type=bug'] },
  ])('rejects terminal stdin with a usage error ($fields)', async ({
    fields,
  }) => {
    client.stdin.isTTY = true;
    client.setArgv('feedback', '-', ...fields);
    await expectFailure(2, 'No input was piped to stdin.');
    expect(client.stderr.getFullOutput()).toContain(
      'cat notes.md | vercel feedback -'
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('waits for all stdin chunks and preserves split UTF-8 characters', async () => {
    client.stdin.isTTY = false;
    client.setArgv('feedback', '-');
    const pending = feedback(client);
    const note = Buffer.from('A note 😕 with more context\n');
    const split = Buffer.byteLength('A note ') + 2;
    client.stdin.write(note.subarray(0, split));
    await Promise.resolve();
    expect(post).not.toHaveBeenCalled();
    client.stdin.end(note.subarray(split));
    expect(await pending).toBe(0);
    expect(submitted().data.note).toBe('A note 😕 with more context');
  });

  it('reports a broken stdin pipe without submitting or echoing the error', async () => {
    client.stdin.isTTY = false;
    client.setArgv('feedback', '-');
    const pending = expectFailure(1, 'Could not read');
    client.stdin.destroy(new Error('private-content'));
    await pending;
    expect(post).not.toHaveBeenCalled();
  });

  it('treats options after -- as literal note text', async () => {
    client.setArgv('feedback', '--', '--json');
    expect(await feedback(client)).toBe(0);
    expect(submitted().data).toEqual({ note: '--json' });
  });

  it.each([
    ['two', 'notes'],
    ['--unknown', 'private-content'],
    ['--json'],
    ['-f'],
    ['-f', 'private-content'],
    ['-f', '=private-content'],
    ['-f', ' =private-content'],
    ['a note', '-f', 'note=private-content'],
    ['a note', '-f', ' note =private-content'],
    [''],
    ['   '],
    ['-'],
    ['-f', 'note= '],
    ['-f', 'type='],
    ['-f', 'type= \t '],
    ['-f', `large=${'😕'.repeat(MAX_FEEDBACK_BYTES / 4)}`],
  ])('rejects invalid input before sending (case %#)', async (...args) => {
    client.setArgv('feedback', ...args);
    await expectFailure(2, 'Error:');
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects oversized stdin before sending', async () => {
    client.stdin.isTTY = false;
    client.stdin.end(Buffer.alloc(MAX_FEEDBACK_BYTES + 1));
    client.setArgv('feedback', '-');
    await expectFailure(2, 'too large');
    expect(post).not.toHaveBeenCalled();
  });

  it.each([302, 429, 500])('does not retry or follow HTTP %i', async status => {
    post.mockResolvedValueOnce(
      new Response('private-response', {
        status,
        headers: { location: 'https://example.com/' },
      })
    );
    client.setArgv('feedback', 'private-content');
    await expectFailure(1, `HTTP ${status}`);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it.each([
    'not JSON',
    '{"success":false}',
  ])('requires an explicit success acknowledgement: %s', async body => {
    post.mockResolvedValueOnce(new Response(body));
    client.setArgv('feedback', 'private-content');
    await expectFailure(1, 'may have been submitted');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('cancels an oversized response without waiting for the stream to end', async () => {
    const cancel = vi.fn();
    post.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(64 * 1024 + 1));
          },
          cancel,
        })
      )
    );
    client.setArgv('feedback', 'A note');
    await expectFailure(1, 'may have been submitted');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('times out without retrying or leaking exception text', async () => {
    vi.useFakeTimers();
    post.mockImplementationOnce(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(new Error('private-content'))
          );
        })
    );
    client.setArgv('feedback', 'private-content');
    const pending = expectFailure(1, 'may have been submitted');
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('keeps notes, field keys, and values out of telemetry and output', async () => {
    client.setArgv(
      'feedback',
      'private-content',
      '-f',
      'private-field=private-value',
      '--debug'
    );
    expect(await feedback(client)).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'argument:note', value: '[REDACTED]' },
      { key: 'option:field', value: '[REDACTED]' },
    ]);
    expect(
      `${client.stdout.getFullOutput()}${client.stderr.getFullOutput()}`
    ).not.toContain('private-');
  });
});
