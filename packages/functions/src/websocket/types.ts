import type { WebSocket } from 'ws';

export interface WebSocketUpgradeResult {
  /**
   * A WebSocket instance with the standard `on('message')`/`send()`
   * interface, powered by the `ws` library.
   */
  socket: WebSocket;
}
