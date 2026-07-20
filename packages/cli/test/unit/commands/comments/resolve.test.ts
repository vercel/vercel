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
vi.mock('../../../../src/util/projects/get-project-by-id-or-name');

describe('comments resolve/reopen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
  });

  it('resolves a single thread without confirmation', async () => {
    let patchBody: Record<string, unknown> | undefined;
    client.scenario.patch('/toolbar/threads/:id', (req, res) => {
      patchBody = req.body;
      res.json(makeThread({ resolved: true }));
    });

    client.setArgv('comments', 'resolve', 'icZ9BnPPINuK');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(patchBody).toEqual({ resolved: true });
    expect(client.stderr.getFullOutput()).toContain('resolved');
  });

  it('posts the closing reply before resolving with -m', async () => {
    const calls: string[] = [];
    client.scenario.post('/toolbar/threads/:id/messages', (req, res) => {
      calls.push('reply');
      expect(req.body.markdown).toBe('Fixed!');
      res.json(makeMessage());
    });
    client.scenario.patch('/toolbar/threads/:id', (_req, res) => {
      calls.push('resolve');
      res.json(makeThread({ resolved: true }));
    });

    client.setArgv(
      'comments',
      'resolve',
      'icZ9BnPPINuK',
      '-m',
      'Fixed!',
      '--format',
      'json'
    );
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(calls).toEqual(['reply', 'resolve']);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.replied).toBe(true);
    expect(parsed.thread.resolved).toBe(true);
  });

  it('reports the replied-but-unresolved half-state', async () => {
    client.scenario.post('/toolbar/threads/:id/messages', (_req, res) => {
      res.json(makeMessage());
    });
    client.scenario.patch('/toolbar/threads/:id', (_req, res) => {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Insufficient access' },
      });
    });

    client.setArgv('comments', 'resolve', 'icZ9BnPPINuK', '-m', 'Fixed!');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Replied, but resolve failed'
    );
  });

  it('rejects -m with multiple threads', async () => {
    client.setArgv('comments', 'resolve', 'id1', 'id2', '-m', 'Fixed!');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('multiple threads');
  });

  it.each([
    ['non-interactive mode', () => (client.nonInteractive = true)],
    ['non-TTY stdin', () => (client.stdin.isTTY = false)],
  ])('requires --yes for bulk operations in %s', async (_name, configure) => {
    configure();
    client.input.confirm = vi.fn();
    client.setArgv('comments', 'resolve', 'id1', 'id2');
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    expect(client.input.confirm).not.toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).toContain('--yes');
  });

  it('continues past bulk failures and exits non-zero', async () => {
    client.scenario.patch('/toolbar/threads/:id', (req, res) => {
      if (req.params.id === 'bad') {
        res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Insufficient access' },
        });
      } else {
        res.json(makeThread({ id: req.params.id, resolved: true }));
      }
    });

    client.setArgv(
      'comments',
      'resolve',
      'good1',
      'bad',
      'good2',
      '--yes',
      '--format',
      'json'
    );
    const exitCode = await comments(client);

    expect(exitCode).toBe(1);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.results).toEqual([
      { id: 'good1', ok: true },
      { id: 'bad', ok: false, error: expect.any(String) },
      { id: 'good2', ok: true },
    ]);
  });

  it('accepts --project as scope context (the flag travels everywhere)', async () => {
    const getProjectModule = await import(
      '../../../../src/util/projects/get-project-by-id-or-name'
    );
    vi.mocked(getProjectModule.default).mockResolvedValue({
      id: 'prj_other',
      name: 'other-project',
    } as never);
    client.scenario.patch('/toolbar/threads/:id', (_req, res) => {
      res.json(makeThread({ resolved: true }));
    });

    client.setArgv(
      'comments',
      'resolve',
      'icZ9BnPPINuK',
      '--project',
      'other-project'
    );
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
  });

  it('reopen sends resolved: false', async () => {
    let patchBody: Record<string, unknown> | undefined;
    client.scenario.patch('/toolbar/threads/:id', (req, res) => {
      patchBody = req.body;
      res.json(makeThread({ resolved: false }));
    });

    client.setArgv('comments', 'reopen', 'icZ9BnPPINuK');
    const exitCode = await comments(client);

    expect(exitCode).toBe(0);
    expect(patchBody).toEqual({ resolved: false });
    expect(client.stderr.getFullOutput()).toContain('reopened');
  });
});
