[**@vercel/functions**](../../README.md)

***

# Function: getWebSocketUpgrade()

> **getWebSocketUpgrade**(): [`WebSocketUpgrade`](../interfaces/WebSocketUpgrade.md) \| `undefined`

Defined in: [packages/functions/src/websocket.ts:40](https://github.com/vercel/vercel/blob/main/packages/functions/src/websocket.ts#L40)

Returns the WebSocket upgrade primitives for the current request when the
Vercel runtime provides them.

## Returns

[`WebSocketUpgrade`](../interfaces/WebSocketUpgrade.md) \| `undefined`

## Example

```js
import { getWebSocketUpgrade } from '@vercel/functions/websocket';

const upgrade = getWebSocketUpgrade();
if (upgrade) {
  // Pass upgrade.req, upgrade.socket, and upgrade.head to a WebSocket server.
}
```
