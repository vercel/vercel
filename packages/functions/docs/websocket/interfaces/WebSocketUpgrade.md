[**@vercel/functions**](../../README.md)

***

# Interface: WebSocketUpgrade

Defined in: [packages/functions/src/websocket.ts:10](https://github.com/vercel/vercel/blob/main/packages/functions/src/websocket.ts#L10)

WebSocket upgrade primitives for the current request.

## Properties

### head

> **head**: `Buffer`

Defined in: [packages/functions/src/websocket.ts:22](https://github.com/vercel/vercel/blob/main/packages/functions/src/websocket.ts#L22)

The first packet of the upgraded stream.

***

### req

> **req**: `IncomingMessage`

Defined in: [packages/functions/src/websocket.ts:14](https://github.com/vercel/vercel/blob/main/packages/functions/src/websocket.ts#L14)

The Node.js request associated with the upgrade.

***

### socket

> **socket**: `Duplex`

Defined in: [packages/functions/src/websocket.ts:18](https://github.com/vercel/vercel/blob/main/packages/functions/src/websocket.ts#L18)

The underlying network socket for the upgrade.
