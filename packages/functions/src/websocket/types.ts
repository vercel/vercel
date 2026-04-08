/**
 * The result of upgrading a request to a WebSocket connection.
 */
export interface WebSocketUpgradeResult {
  /**
   * A WebSocket instance with the standard `onmessage`/`send()`
   * interface, powered by the `ws` library.
   */
  socket: import('ws').WebSocket;

  /**
   * A synthetic 101 Switching Protocols response.
   *
   * In frameworks that require returning a Response from the route
   * handler, return this to signal the upgrade is complete.
   */
  response: Response;
}
