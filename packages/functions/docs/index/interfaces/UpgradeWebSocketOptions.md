[**@vercel/functions**](../../README.md)

***

# Interface: UpgradeWebSocketOptions

Defined in: [packages/functions/src/websocket/index.ts:4](https://github.com/vercel/vercel/blob/main/packages/functions/src/websocket/index.ts#L4)

## Properties

### maxPayload?

> `optional` **maxPayload?**: `number`

Defined in: [packages/functions/src/websocket/index.ts:10](https://github.com/vercel/vercel/blob/main/packages/functions/src/websocket/index.ts#L10)

Maximum allowed message size in bytes.

This is forwarded to ws's WebSocketServer `maxPayload` option.
