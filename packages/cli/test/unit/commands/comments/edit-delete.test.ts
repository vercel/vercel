import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import comments from '../../../../src/commands/comments';
import { makeMessage, mockLinkedProject, mockTeamScope } from './helpers';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');

describe('comments edit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
  });

  it('sends markdown and omits attachments so existing ones are preserved', async () => {
    // The API treats `attachments` as the desired final list; sending [] would
    // wipe existing attachments. This test guards that contract.
    let patchBody: Record<string, unknown> | undefined;
    client.scenario.patch('/toolbar/threads/:id/messages/:mid', (req, res) => {
      patchBody = req.body;
      res.json(makeMessage({ id: req.params.mid }));
    });

    client.setArgv(
      'comments',
      'edit',
      'icZ9BnPPINuK',
      'msg_target',
      '-m',
      'Updated'
    );
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(patchBody).toEqual({ markdown: 'Updated' });
    expect(Object.keys(patchBody!)).not.toContain('attachments');
  });

  it('requires content', async () => {
    client.nonInteractive = true;
    client.setArgv('comments', 'edit', 'icZ9BnPPINuK', 'msg_target');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
  });
});

describe('comments delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
  });

  it.each([
    ['non-interactive mode', () => (client.nonInteractive = true)],
    ['non-TTY stdin', () => (client.stdin.isTTY = false)],
  ])('requires --yes in %s', async (_name, configure) => {
    configure();
    client.input.confirm = vi.fn();
    client.setArgv('comments', 'delete', 'icZ9BnPPINuK', 'msg_target');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    expect(client.input.confirm).not.toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).toContain('--yes');
  });

  it('deletes with --yes and emits the API result in JSON mode', async () => {
    let deletedId: string | undefined;
    client.scenario.delete('/toolbar/threads/:id/messages/:mid', (req, res) => {
      deletedId = req.params.mid;
      res.json({ id: req.params.mid });
    });

    client.setArgv(
      'comments',
      'delete',
      'icZ9BnPPINuK',
      'msg_target',
      '--yes',
      '--format',
      'json'
    );
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(deletedId).toBe('msg_target');
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      id: 'msg_target',
    });
  });
});
