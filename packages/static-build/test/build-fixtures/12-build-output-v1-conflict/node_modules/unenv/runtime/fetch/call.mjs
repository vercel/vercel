import { IncomingMessage } from "../node/http/_request.mjs";
import { ServerResponse } from "../node/http/_response.mjs";
export function createCall(handle) {
  return function callHandle(context) {
    const req = new IncomingMessage();
    const res = new ServerResponse(req);
    req.url = context.url || "/";
    req.method = context.method || "GET";
    req.headers = context.headers || {};
    req.headers.host = req.headers.host || context.host || void 0;
    req.connection.encrypted = req.connection.encrypted || context.protocol === "https";
    req.body = context.body || null;
    return handle(req, res).then(() => {
      const r = {
        body: res._data?.toString() ?? "",
        headers: res._headers,
        status: res.statusCode,
        statusText: res.statusMessage
      };
      req.destroy();
      res.destroy();
      return r;
    });
  };
}
