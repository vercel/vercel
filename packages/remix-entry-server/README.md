# `@vercel/remix-entry-server`

This package is meant for use within Remix applications when deploying to Vercel. It provides implementations for the `app/entry.server.tsx` file for both the Node.js Serverless Runtime and the Edge Runtime. The implementations are configured to [handle streaming responses](https://remix.run/docs/en/v1/guides/streaming).

## Usage

Make sure `@vercel/remix-entry-server` is installed with your package manager of choice, then replace your `app/entry.server.tsx` file with the following:

```tsx
// `app/entry.server.tsx`

import handleRequest from '@vercel/remix-entry-server';
import { RemixServer } from '@remix-run/react';
import type { EntryContext } from '@remix-run/server-runtime';

export default function (
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext
) {
  const remixServer = <RemixServer context={remixContext} url={request.url} />;
  return handleRequest(
    request,
    responseStatusCode,
    responseHeaders,
    remixServer
  );
}
```
