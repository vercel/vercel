import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import comments from '../../../../src/commands/comments';
import {
  makeMessage,
  makeThread,
  mockLinkedProject,
  mockTeamScope,
} from './helpers';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');

describe('comments react/unreact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
  });

  it('reacts to the latest message by default with a name', async () => {
    client.scenario.get('/toolbar/threads/:id', (_req, res) => {
      res.json(
        makeThread({
          messages: [
            makeMessage({ id: 'msg_old' }),
            makeMessage({ id: 'msg_latest' }),
          ],
        })
      );
    });
    let reactedMessageId: string | undefined;
    let postBody: Record<string, unknown> | undefined;
    client.scenario.post(
      '/toolbar/threads/:id/messages/:mid/reactions',
      (req, res) => {
        reactedMessageId = req.params.mid;
        postBody = req.body;
        res.json(makeMessage({ id: req.params.mid }));
      }
    );

    client.setArgv('comments', 'react', 'icZ9BnPPINuK', 'white_check_mark');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(reactedMessageId).toBe('msg_latest');
    expect(postBody).toEqual({ name: 'white_check_mark' });
  });

  it('skips the thread fetch when --message-id is given', async () => {
    let reactedMessageId: string | undefined;
    client.scenario.post(
      '/toolbar/threads/:id/messages/:mid/reactions',
      (req, res) => {
        reactedMessageId = req.params.mid;
        res.json(makeMessage());
      }
    );

    client.setArgv(
      'comments',
      'react',
      'icZ9BnPPINuK',
      'eyes',
      '--message-id',
      'msg_target'
    );
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(reactedMessageId).toBe('msg_target');
  });

  it('unreact targets the caller’s most recent matching reaction', async () => {
    client.scenario.get('/toolbar/threads/:id', (_req, res) => {
      res.json(
        makeThread({
          messages: [
            makeMessage({
              id: 'msg_mine',
              reactions: [
                {
                  name: 'white_check_mark',
                  emoji: '✅',
                  users: [{ type: 'user', id: 'user_dummy' }],
                },
              ],
            }),
            makeMessage({
              id: 'msg_other',
              reactions: [
                {
                  name: 'white_check_mark',
                  emoji: '✅',
                  users: [{ type: 'user', id: 'user_other' }],
                },
              ],
            }),
          ],
        })
      );
    });
    let removedFrom: string | undefined;
    let removedName: string | undefined;
    client.scenario.delete(
      '/toolbar/threads/:id/messages/:mid/reactions/:name',
      (req, res) => {
        removedFrom = req.params.mid;
        removedName = req.params.name;
        res.json(makeMessage());
      }
    );

    client.setArgv('comments', 'unreact', 'icZ9BnPPINuK', 'white_check_mark');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(removedFrom).toBe('msg_mine');
    expect(removedName).toBe('white_check_mark');
  });

  it('errors with guidance when the caller has no matching reaction', async () => {
    client.scenario.get('/toolbar/threads/:id', (_req, res) => {
      res.json(makeThread());
    });

    client.setArgv('comments', 'unreact', 'icZ9BnPPINuK', 'eyes');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('--message');
  });

  it('suggests close matches when the API rejects a name', async () => {
    client.scenario.get('/toolbar/threads/:id', (_req, res) => {
      res.json(makeThread());
    });
    client.scenario.post(
      '/toolbar/threads/:id/messages/:mid/reactions',
      (_req, res) => {
        res.status(400).json({
          error: { code: 'BAD_REQUEST', message: 'Invalid input data' },
        });
      }
    );
    client.scenario.get('/toolbar/emojis', (req, res) => {
      expect(req.query.search).toBe('check');
      res.json({
        emojis: [{ name: 'white_check_mark', emoji: '✅' }],
        pagination: { total: 1, from: 0, limit: 50, hasMore: false },
      });
    });

    client.setArgv('comments', 'react', 'icZ9BnPPINuK', 'check');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('white_check_mark');
  });
});
