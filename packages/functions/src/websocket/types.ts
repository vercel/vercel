import type { Duplex } from 'stream';

/**
 * The result of upgrading a request to a WebSocket connection.
 */
export interface WebSocketUpgradeResult {
  /**
   * The raw duplex stream for bidirectional communication.
   *
   * This is the underlying Node.js socket after the 101 handshake.
   * Data sent and received on this stream is raw (no WebSocket framing).
   *
   * TODO: Wrap with WebSocket framing to provide the standard
   * `onmessage`/`send()` interface.
   */
  socket: Duplex;

  /**
   * A synthetic 101 Switching Protocols response.
   *
   * In frameworks that require returning a Response from the route
   * handler, return this to signal the upgrade is complete.
   */
  response: Response;
}
