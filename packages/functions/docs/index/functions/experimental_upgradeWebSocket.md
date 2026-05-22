[**@vercel/functions**](../../README.md)

***

# Function: experimental\_upgradeWebSocket()

> **experimental\_upgradeWebSocket**(`handler`): [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<[`Response`](https://developer.mozilla.org/docs/Web/API/Response)\>

Defined in: [packages/functions/src/websocket/index.ts:20](https://github.com/vercel/vercel/blob/main/packages/functions/src/websocket/index.ts#L20)

Upgrades the current request to a WebSocket connection, invokes the handler
with the upgraded WebSocket, and resolves with a Response that can be
returned from a route handler.

## Parameters

### handler

(`ws`) => `void` \| [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`void`\>

## Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<[`Response`](https://developer.mozilla.org/docs/Web/API/Response)\>

## Example

```ts
export async function GET() {
  return experimental_upgradeWebSocket(ws => {
    ws.on('message', data => {
      ws.send(`echo: ${data.toString()}`);
    });
  });
}
```
