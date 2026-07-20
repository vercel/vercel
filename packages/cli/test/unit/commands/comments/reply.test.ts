import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import comments from '../../../../src/commands/comments';
import { makeMessage, mockLinkedProject, mockTeamScope } from './helpers';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');

describe('comments reply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
  });

  it('posts markdown content with -m', async () => {
    let postBody: Record<string, unknown> | undefined;
    client.scenario.post('/toolbar/threads/:id/messages', (req, res) => {
      postBody = req.body;
      res.json(makeMessage({ id: 'msg_new' }));
    });

    client.setArgv(
      'comments',
      'reply',
      'icZ9BnPPINuK',
      '-m',
      'Fixed in **main**.'
    );
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(postBody).toEqual({ markdown: 'Fixed in **main**.' });
    expect(client.stderr.getFullOutput()).toContain('Replied to icZ9BnPPINuK');
  });

  it('emits the API message object under --format json', async () => {
    client.scenario.post('/toolbar/threads/:id/messages', (_req, res) => {
      res.json(makeMessage({ id: 'msg_new' }));
    });

    client.setArgv(
      'comments',
      'reply',
      'icZ9BnPPINuK',
      '-m',
      'ok',
      '--format',
      'json'
    );
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).not.toContain('Posting reply');
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.id).toBe('msg_new');
  });

  it('sends https attachments and allows attachment-only replies', async () => {
    let postBody: Record<string, unknown> | undefined;
    client.scenario.post('/toolbar/threads/:id/messages', (req, res) => {
      postBody = req.body;
      res.json(makeMessage());
    });

    client.setArgv(
      'comments',
      'reply',
      'icZ9BnPPINuK',
      '--attach',
      'https://example.com/shot.png'
    );
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(postBody).toEqual({
      attachments: [{ url: 'https://example.com/shot.png' }],
    });
  });

  it('preserves file content byte-for-byte with --file', async () => {
    const content = 'First paragraph\n\nSecond **bold** paragraph\n';
    const file = join(mkdtempSync(join(tmpdir(), 'vc-comments-')), 'msg.md');
    writeFileSync(file, content);

    let postBody: Record<string, unknown> | undefined;
    client.scenario.post('/toolbar/threads/:id/messages', (req, res) => {
      postBody = req.body;
      res.json(makeMessage());
    });

    client.setArgv('comments', 'reply', 'icZ9BnPPINuK', '--file', file);
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(postBody).toEqual({ markdown: content });
  });

  it('rejects non-https attachments', async () => {
    client.setArgv(
      'comments',
      'reply',
      'icZ9BnPPINuK',
      '-m',
      'see file',
      '--attach',
      './local.png'
    );
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('https');
  });

  it('rejects conflicting --message and --file', async () => {
    client.setArgv(
      'comments',
      'reply',
      'icZ9BnPPINuK',
      '-m',
      'a',
      '--file',
      'b.md'
    );
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('not both');
  });

  it('errors on missing content non-interactively', async () => {
    client.nonInteractive = true;
    client.setArgv('comments', 'reply', 'icZ9BnPPINuK');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('No content provided');
  });

  it.each([
    ['stdin is not a TTY', () => (client.stdin.isTTY = false), []],
    ['JSON output is requested', () => {}, ['--format', 'json']],
  ])('does not prompt for missing content when %s', async (_name, configure, args) => {
    configure();
    client.input.text = vi.fn();
    client.setArgv('comments', 'reply', 'icZ9BnPPINuK', ...args);
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    expect(client.input.text).not.toHaveBeenCalled();
    const output = args.length
      ? JSON.parse(client.stdout.getFullOutput()).error.message
      : client.stderr.getFullOutput();
    expect(output).toContain('No content provided');
  });
});
