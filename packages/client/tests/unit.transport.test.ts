import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { continueDeployment } from '../src/continue';
import { uploadFiles, UploadProgress } from '../src/upload';
import { fetchApi } from '../src/utils';

async function collect(events: AsyncIterable<{ type: string; payload: any }>) {
  const results = [];
  for await (const event of events) results.push(event);
  return results;
}

describe('local HTTP transport faults', () => {
  let path: string;
  let server: Server;
  beforeEach(async () => {
    path = await mkdtemp(join(tmpdir(), 'client-transport-'));
    await mkdir(join(path, '.vercel/output'), { recursive: true });
    await writeFile(join(path, '.vercel/output/config.json'), '{"version":3}');
  });
  afterEach(async () => {
    server?.closeAllConnections();
    if (server)
      await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(path, { recursive: true, force: true });
    vi.restoreAllMocks();
  });
  async function listen(
    handler: (req: IncomingMessage, res: ServerResponse) => void
  ) {
    server = createServer(handler);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing local server address');
    return `http://127.0.0.1:${address.port}`;
  }

  it.each(
    ['socket', '503', 'invalid-503-body'].flatMap(fault =>
      ['buffer', 'file'].map(source => ({ fault, source }))
    )
  )('retries a $source upload after $fault and replays the complete body', async ({
    fault,
    source,
  }) => {
    const bodies: string[] = [];
    const apiUrl = await listen(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      bodies.push(Buffer.concat(chunks).toString());
      if (bodies.length === 1) {
        if (fault === 'socket') req.socket.destroy();
        else {
          res.writeHead(503);
          res.end(
            fault === '503'
              ? JSON.stringify({
                  error: {
                    code: 'unavailable',
                    message: 'Temporary failure',
                  },
                })
              : 'Service Unavailable'
          );
        }
        return;
      }
      res.end('{}');
    });
    await writeFile(join(path, 'test.txt'), 'local payload');
    const file = {
      ...(source === 'buffer'
        ? { data: Buffer.from('local payload') }
        : { size: Buffer.byteLength('local payload') }),
      names: [join(path, 'test.txt')],
      mode: 0o666,
    };
    const results = await collect(
      uploadFiles({
        apiUrl,
        token: 'dummy',
        shas: ['sha'],
        files: new Map([['sha', file]]),
        uploads: [new UploadProgress('sha', file)],
      })
    );
    expect(results.map(e => e.type)).toEqual(['file-uploaded']);
    expect(bodies).toEqual(['local payload', 'local payload']);
  });

  it.each([
    'before-headers',
    'during-body',
  ])('reports an unknown resume outcome without replaying after loss %s', async fault => {
    let requests = 0;
    const apiUrl = await listen(async (req, res) => {
      for await (const _chunk of req) {
        /* drain request */
      }
      requests++;
      if (fault === 'during-body') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write('{"id":');
        setTimeout(() => res.destroy(), 10);
      } else {
        req.socket.destroy();
      }
    });
    await expect(
      collect(
        continueDeployment({
          apiUrl,
          token: 'dummy',
          path,
          deploymentId: 'dpl_local',
        })
      )
    ).rejects.toMatchObject({
      code: 'deployment_continue_unavailable',
      message: expect.stringContaining('vercel inspect dpl_local'),
      cause: { cause: { code: 'UND_ERR_SOCKET' } },
    });
    expect(requests).toBe(1);
  });

  it('does not retry an upload rejected with HTTP 403', async () => {
    let requests = 0;
    const apiUrl = await listen((_req, res) => {
      requests++;
      res.writeHead(403);
      res.end(
        JSON.stringify({ error: { code: 'forbidden', message: 'Forbidden' } })
      );
    });
    const file = {
      data: Buffer.from('local payload'),
      names: [join(path, 'test.txt')],
      mode: 0o666,
    };
    const results = await collect(
      uploadFiles({
        apiUrl,
        token: 'dummy',
        shas: ['sha'],
        files: new Map([['sha', file]]),
        uploads: [new UploadProgress('sha', file)],
      })
    );
    expect(results[0]).toMatchObject({
      type: 'error',
      payload: { code: 'forbidden' },
    });
    expect(requests).toBe(1);
  });

  it('logs response status and request IDs without query values or authorization', async () => {
    const apiUrl = await listen((_req, res) => {
      res.setHeader('x-vercel-id', 'local-test');
      res.end('{}');
    });
    const write = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    await fetchApi(
      '/test?private=DO_NOT_LOG',
      'SECRET_TOKEN',
      { apiUrl },
      true
    );
    const output = write.mock.calls.map(call => call[0]).join('');
    expect(output).toContain('status=200 requestId=local-test');
    expect(output).not.toMatch(/DO_NOT_LOG|SECRET_TOKEN/);
  });
});
