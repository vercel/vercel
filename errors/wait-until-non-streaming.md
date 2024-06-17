# The waitUntil API has limited support for non-streaming functions

## Why This Warning Occurred

The [waitUntil](https://vercel.com/docs/functions/functions-api-reference#waituntil) method allows you to enqueue asynchronous tasks to be performed during the lifecycle of the request, and these tasks can continue to resolve even after the response has been written. This is possible because `waitUntil` takes advantage of [streaming functions](https://vercel.com/docs/functions/streaming#streaming-functions).

When `waitUntil` is used in a [non-streaming function](https://vercel.com/docs/functions/streaming#non-streaming-functions), the behavior is limited and the function will delay the response until after the enqueued asynchronous tasks have been resolved.

## How to Fix It

To overcome the limitations of `waitUntil` with [non-streaming functions](https://vercel.com/docs/functions/streaming#non-streaming-functions), you should explicitly opt-in your functions to support streaming:

```js
export const config = {
  supportsResponseStreaming: true,
};
```
