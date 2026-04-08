import type { WebSocket } from 'ws';

export interface WebSocketUpgradeResult {
  socket: WebSocket;

  /**
   * A synthetic 101 Switching Protocols response.
   *
   * In frameworks that require returning a Response from the route
   * handler, return this to signal the upgrade is complete.
   */
  response: Response;
}
