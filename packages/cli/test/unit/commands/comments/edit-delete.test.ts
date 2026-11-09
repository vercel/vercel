import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import comments from '../../../../src/commands/comments';
import { makeMessage, mockLinkedProject, mockTeamScope } from './helpers';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../../../src/util/get-scope')>();
  return { ...actual, default: vi.fn() };
});

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

    expect(exitCode).toBe(2);
  });

  describe('subcommand name', () => {
    function useMessagePatch() {
      client.scenario.patch(
        '/toolbar/threads/:id/messages/:mid',
        (req, res) => {
          res.json(makeMessage({ id: req.params.mid }));
        }
      );
    }

    it('warns when invoked as the deprecated edit name', async () => {
      useMessagePatch();
      client.setArgv(
        'comments',
        'edit',
        'icZ9BnPPINuK',
        'msg_target',
        '-m',
        'Updated'
      );

      expect(await comments(client)).toBe(0);
      await expect(client.stderr).toOutput(
        '`vercel comments edit` is deprecated. Use `vercel comments update`.'
      );
    });

    it('does not warn when invoked as update', async () => {
      useMessagePatch();
      client.setArgv(
        'comments',
        'update',
        'icZ9BnPPINuK',
        'msg_target',
        '--message',
        'Updated'
      );

      expect(await comments(client)).toBe(0);
      const output = client.stderr.getFullOutput();
      expect(output).toContain('Updated message msg_target');
      expect(output).not.toContain('Edited message');
      expect(output).not.toContain('is deprecated');
    });
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
