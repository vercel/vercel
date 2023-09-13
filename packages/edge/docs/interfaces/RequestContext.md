# Interface: RequestContext

An extension to the standard `Request` object that is passed to every Edge Function.

**`Example`**

```ts
import type { RequestContext } from '@vercel/edge';

export default async function handler(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  // ctx is the RequestContext
}
```

## Table of contents

### Methods

- [waitUntil](RequestContext.md#waituntil)

## Methods

### waitUntil

▸ **waitUntil**(`promise`): `void`

A method that can be used to keep the function running after a response has been sent.
This is useful when you have an async task that you want to keep running even after the
response has been sent and the request has ended.

**`Example`**

<caption>Sending an internal error to an error tracking service</caption>

```ts
import type { RequestContext } from '@vercel/edge';

export async function handleRequest(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  try {
    return await myFunctionThatReturnsResponse();
  } catch (e) {
    ctx.waitUntil(
      (async () => {
        // report this error to your error tracking service
        await fetch('https://my-error-tracking-service.com', {
          method: 'POST',
          body: JSON.stringify({
            stack: e.stack,
            message: e.message,
            name: e.name,
            url: request.url,
          }),
        });
      })()
    );
    return new Response('Internal Server Error', { status: 500 });
  }
}
```

#### Parameters

| Name      | Type                                                                                                              | Description                                                     |
| :-------- | :---------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------- |
| `promise` | [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`unknown`\> | A promise that will be kept alive until it resolves or rejects. |

#### Returns

`void`

#### Defined in

[packages/edge/src/request.ts:47](https://github.com/PaulieScanlon/vercel/blob/main/packages/edge/src/request.ts#L47)
