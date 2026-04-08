# Interface: WebSocketUpgradeResult

[index](../modules/index.md).WebSocketUpgradeResult

## Table of contents

### Properties

- [response](index.WebSocketUpgradeResult.md#response)
- [socket](index.WebSocketUpgradeResult.md#socket)

## Properties

### response

• **response**: [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response)

A synthetic 101 Switching Protocols response.

In frameworks that require returning a Response from the route
handler, return this to signal the upgrade is complete.

#### Defined in

[packages/functions/src/websocket/types.ts:12](https://github.com/vercel/vercel/blob/main/packages/functions/src/websocket/types.ts#L12)

---

### socket

• **socket**: `WebSocket`

#### Defined in

[packages/functions/src/websocket/types.ts:4](https://github.com/vercel/vercel/blob/main/packages/functions/src/websocket/types.ts#L4)
