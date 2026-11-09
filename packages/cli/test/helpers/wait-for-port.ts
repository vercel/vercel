import net from 'net';

/**
 * Waits until a TCP server listening on `port` actually accepts new
 * connections.
 *
 * `vc dev` prints its "Ready! Available at" message once the HTTP server's
 * `listen()` call resolves, but under CI load there is a small window where
 * the OS socket is not yet ready to accept a new connection, which results
 * in a transient `ECONNREFUSED` for whichever request happens to race it.
 * Rather than trusting the printed readiness message alone (or bumping the
 * overall test timeout to paper over it), poll with a short, bounded
 * backoff until a raw TCP connection actually succeeds.
 */
export async function waitForPortToAccept(
  port: number,
  {
    host = 'localhost',
    timeout = 10_000,
    interval = 100,
  }: { host?: string; timeout?: number; interval?: number } = {}
): Promise<void> {
  const start = Date.now();
  let lastError: Error | undefined;

  while (Date.now() - start < timeout) {
    const error = await new Promise<Error | undefined>(resolve => {
      const socket = net.connect({ port, host });
      socket.once('connect', () => {
        socket.destroy();
        resolve(undefined);
      });
      socket.once('error', err => {
        socket.destroy();
        resolve(err as Error);
      });
    });

    if (!error) return;

    lastError = error;
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(
    `Timed out after ${timeout}ms waiting for port ${port} to accept connections` +
      (lastError ? `: ${lastError.message}` : '')
  );
}
