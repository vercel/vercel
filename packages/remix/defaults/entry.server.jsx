import handleRequest from '@vercel/remix-entry-server';
import { RemixServer } from '@remix-run/react';

export default function (
  request,
  responseStatusCode,
  responseHeaders,
  remixContext
) {
  const remixServer = <RemixServer context={remixContext} url={request.url} />;
  return handleRequest(
    request,
    responseStatusCode,
    responseHeaders,
    remixServer
  );
}
