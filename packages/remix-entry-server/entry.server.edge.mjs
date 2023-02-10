import isbot from "isbot";
import { renderToReadableStream } from "react-dom/server";

export default async function handleRequest(
  request,
  remixServer,
  responseStatusCode,
  responseHeaders,
) {
  const body = await renderToReadableStream(
    remixServer,
    {
      signal: request.signal,
      onError(error) {
        console.error(error);
        responseStatusCode = 500;
      },
    }
  );

  if (isbot(request.headers.get("user-agent"))) {
    await body.allReady;
  }

  responseHeaders.set("Content-Type", "text/html");
  // eslint-disable-next-line no-undef
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}