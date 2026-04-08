# Interface: WebSocketUpgradeResult

[index](../modules/index.md).WebSocketUpgradeResult

The result of upgrading a request to a WebSocket connection.

## Table of contents

### Properties

- [response](index.WebSocketUpgradeResult.md#response)
- [socket](index.WebSocketUpgradeResult.md#socket)

## Properties

### response

• **response**: [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response)

The 101 Switching Protocols response that must be returned
from the route handler to complete the upgrade.

#### Defined in

packages/functions/src/websocket/types.ts:15

---

### socket

• **socket**: [`WebSocket`](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

The WebSocket instance for the server side of the connection.
Conforms to the standard Web API WebSocket interface.

#### Defined in

packages/functions/src/websocket/types.ts:9
