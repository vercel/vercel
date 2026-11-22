import { createServer, type Server } from 'net';
import { afterEach, describe, expect, it } from 'vitest';
import { waitForPortToFree } from '../../../../src/util/dev/port-utils';

function listen(): Promise<{ server: Server; port: number }> {
  return new Promise(resolve => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        port: typeof address === 'object' && address ? address.port : 0,
      });
    });
  });
}

describe('waitForPortToFree', () => {
  const servers: Server[] = [];

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
  });

  it('is true for a port nothing listens on', async () => {
    const { server, port } = await listen();
    await new Promise(resolve => server.close(resolve));

    await expect(waitForPortToFree(port)).resolves.toBe(true);
  });

  it('is false at once for a taken port without a timeout', async () => {
    const { server, port } = await listen();
    servers.push(server);

    await expect(waitForPortToFree(port)).resolves.toBe(false);
  });

  it('waits for a listener that closes within the timeout', async () => {
    const { server, port } = await listen();
    setTimeout(() => server.close(), 300);

    await expect(waitForPortToFree(port, 5000)).resolves.toBe(true);
  });

  it('gives up on a listener that outlasts the timeout', async () => {
    const { server, port } = await listen();
    servers.push(server);

    await expect(waitForPortToFree(port, 300)).resolves.toBe(false);
  });
});
