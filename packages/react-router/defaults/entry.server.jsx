import { ServerRouter } from "react-router";
import { handleRequest } from "@vercel/react-router/entry.server";

export default function (
  request,
  responseStatusCode,
  responseHeaders,
  routerContext
) {
  const router = <ServerRouter context={routerContext} url={request.url} />;
  return handleRequest(
    request,
    responseStatusCode,
    responseHeaders,
    router
  );
}
