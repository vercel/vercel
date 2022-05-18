import { getQuery, withoutTrailingSlash, withoutBase } from 'ufo';
import { createRouter as createRouter$1 } from 'radix3';
import destr from 'destr';
import { parse, serialize } from 'cookie-es';

function useQuery(event) {
  return getQuery(event.req.url || "");
}
function useMethod(event, defaultMethod = "GET") {
  return (event.req.method || defaultMethod).toUpperCase();
}
function isMethod(event, expected, allowHead) {
  const method = useMethod(event);
  if (allowHead && method === "HEAD") {
    return true;
  }
  if (typeof expected === "string") {
    if (method === expected) {
      return true;
    }
  } else if (expected.includes(method)) {
    return true;
  }
  return false;
}
function assertMethod(event, expected, allowHead) {
  if (!isMethod(event, expected, allowHead)) {
    throw createError({
      statusCode: 405,
      statusMessage: "HTTP method is not allowed."
    });
  }
}

const RawBodySymbol = Symbol("h3RawBody");
const ParsedBodySymbol = Symbol("h3RawBody");
const PayloadMethods = ["PATCH", "POST", "PUT", "DELETE"];
function useRawBody(event, encoding = "utf-8") {
  assertMethod(event, PayloadMethods);
  if (RawBodySymbol in event.req) {
    const promise2 = Promise.resolve(event.req[RawBodySymbol]);
    return encoding ? promise2.then((buff) => buff.toString(encoding)) : promise2;
  }
  if ("body" in event.req) {
    return Promise.resolve(event.req.body);
  }
  const promise = event.req[RawBodySymbol] = new Promise((resolve, reject) => {
    const bodyData = [];
    event.req.on("error", (err) => {
      reject(err);
    }).on("data", (chunk) => {
      bodyData.push(chunk);
    }).on("end", () => {
      resolve(Buffer.concat(bodyData));
    });
  });
  return encoding ? promise.then((buff) => buff.toString(encoding)) : promise;
}
async function useBody(event) {
  if (ParsedBodySymbol in event.req) {
    return event.req[ParsedBodySymbol];
  }
  const body = await useRawBody(event);
  if (event.req.headers["content-type"] === "application/x-www-form-urlencoded") {
    const parsedForm = Object.fromEntries(new URLSearchParams(body));
    return parsedForm;
  }
  const json = destr(body);
  event.req[ParsedBodySymbol] = json;
  return json;
}

function handleCacheHeaders(event, opts) {
  const cacheControls = ["public"].concat(opts.cacheControls || []);
  let cacheMatched = false;
  if (opts.maxAge !== void 0) {
    opts.cacheControls?.push(`max-age=${+opts.maxAge}`, `s-maxage=${+opts.maxAge}`);
  }
  if (opts.modifiedTime) {
    const modifiedTime = new Date(opts.modifiedTime);
    const ifModifiedSince = event.req.headers["if-modified-since"];
    event.res.setHeader("Last-Modified", modifiedTime.toUTCString());
    if (ifModifiedSince) {
      if (new Date(ifModifiedSince) >= opts.modifiedTime) {
        cacheMatched = true;
      }
    }
  }
  if (opts.etag) {
    event.res.setHeader("Etag", opts.etag);
    const ifNonMatch = event.req.headers["if-none-match"];
    if (ifNonMatch === opts.etag) {
      cacheMatched = true;
    }
  }
  event.res.setHeader("Cache-Control", cacheControls.join(", "));
  if (cacheMatched) {
    event.res.statusCode = 304;
    event.res.end("");
    return true;
  }
  return false;
}

const MIMES = {
  html: "text/html",
  json: "application/json"
};

const defer = typeof setImmediate !== "undefined" ? setImmediate : (fn) => fn();
function send(event, data, type) {
  if (type) {
    defaultContentType(event, type);
  }
  return new Promise((resolve) => {
    defer(() => {
      event.res.end(data);
      resolve(void 0);
    });
  });
}
function defaultContentType(event, type) {
  if (type && !event.res.getHeader("Content-Type")) {
    event.res.setHeader("Content-Type", type);
  }
}
function sendRedirect(event, location, code = 302) {
  event.res.statusCode = code;
  event.res.setHeader("Location", location);
  return send(event, "Redirecting to " + location, MIMES.html);
}
function appendHeader(event, name, value) {
  let current = event.res.getHeader(name);
  if (!current) {
    event.res.setHeader(name, value);
    return;
  }
  if (!Array.isArray(current)) {
    current = [current.toString()];
  }
  event.res.setHeader(name, current.concat(value));
}
function isStream(data) {
  return data && typeof data === "object" && typeof data.pipe === "function" && typeof data.on === "function";
}
function sendStream(event, data) {
  return new Promise((resolve, reject) => {
    data.pipe(event.res);
    data.on("end", () => resolve(void 0));
    data.on("error", (error) => reject(createError(error)));
  });
}

function useCookies(event) {
  return parse(event.req.headers.cookie || "");
}
function useCookie(event, name) {
  return useCookies(event)[name];
}
function setCookie(event, name, value, serializeOptions) {
  const cookieStr = serialize(name, value, {
    path: "/",
    ...serializeOptions
  });
  appendHeader(event, "Set-Cookie", cookieStr);
}
function deleteCookie(event, name, serializeOptions) {
  setCookie(event, name, "", {
    ...serializeOptions,
    maxAge: 0
  });
}

class H3Error extends Error {
  constructor() {
    super(...arguments);
    this.statusCode = 500;
    this.statusMessage = "H3Error";
  }
}
function createError(input) {
  if (input instanceof H3Error) {
    return input;
  }
  const err = new H3Error(input.message ?? input.statusMessage);
  if (input.statusCode) {
    err.statusCode = input.statusCode;
  }
  if (input.statusMessage) {
    err.statusMessage = input.statusMessage;
  }
  if (input.data) {
    err.data = input.data;
  }
  return err;
}
function sendError(event, error, debug) {
  if (event.res.writableEnded) {
    return;
  }
  const h3Error = isError(error) ? error : createError(error);
  const responseBody = {
    statusCode: h3Error.statusCode,
    statusMessage: h3Error.statusMessage,
    stack: [],
    data: h3Error.data
  };
  if (debug) {
    responseBody.stack = (h3Error.stack || "").split("\n").map((l) => l.trim());
  }
  if (event.res.writableEnded) {
    return;
  }
  event.res.statusCode = h3Error.statusCode;
  event.res.statusMessage = h3Error.statusMessage;
  event.res.setHeader("Content-Type", MIMES.json);
  event.res.end(JSON.stringify(responseBody, null, 2));
}
function isError(input) {
  return input instanceof H3Error;
}

const defineHandler = (handler) => handler;
const defineHandle = defineHandler;
const defineMiddleware = (middleware) => middleware;
function promisifyHandler(handler) {
  return function(req, res) {
    return callHandler(handler, req, res);
  };
}
const promisifyHandle = promisifyHandler;
function callHandler(handler, req, res) {
  const isMiddleware = handler.length > 2;
  return new Promise((resolve, reject) => {
    const next = (err) => {
      if (isMiddleware) {
        res.off("close", next);
        res.off("error", next);
      }
      return err ? reject(createError(err)) : resolve(void 0);
    };
    try {
      const returned = handler(req, res, next);
      if (isMiddleware && returned === void 0) {
        res.once("close", next);
        res.once("error", next);
      } else {
        resolve(returned);
      }
    } catch (err) {
      next(err);
    }
  });
}
function defineLazyHandler(handler, promisify) {
  let _promise;
  const resolve = () => {
    if (!_promise) {
      _promise = Promise.resolve(handler()).then((r) => promisify ? promisifyHandler(r.default || r) : r.default || r);
    }
    return _promise;
  };
  return function(req, res) {
    return resolve().then((h) => h(req, res));
  };
}
const lazyHandle = defineLazyHandler;
function useBase(base, handler) {
  base = withoutTrailingSlash(base);
  if (!base) {
    return handler;
  }
  return function(req, res) {
    req.originalUrl = req.originalUrl || req.url || "/";
    req.url = withoutBase(req.url || "/", base);
    return handler(req, res);
  };
}

function defineEventHandler(handler) {
  handler.__is_handler__ = true;
  return handler;
}
const eventHandler = defineEventHandler;
function defineLazyEventHandler(factory) {
  let _promise;
  let _resolved;
  const resolveHandler = () => {
    if (_resolved) {
      return Promise.resolve(_resolved);
    }
    if (!_promise) {
      _promise = Promise.resolve(factory()).then((r) => {
        const handler = r.default || r;
        if (typeof handler !== "function") {
          throw new TypeError("Invalid lazy handler result. It should be a function:", handler);
        }
        _resolved = toEventHandler(r.default || r);
        return _resolved;
      });
    }
    return _promise;
  };
  return eventHandler((event) => {
    if (_resolved) {
      return _resolved(event);
    }
    return resolveHandler().then((handler) => handler(event));
  });
}
const lazyEventHandler = defineLazyEventHandler;
function dynamicEventHandler(initial) {
  let current = initial;
  const wrapper = eventHandler((event) => {
    if (current) {
      return current(event);
    }
  });
  wrapper.set = (handler) => {
    current = handler;
  };
  return wrapper;
}
function isEventHandler(input) {
  return "__is_handler__" in input;
}
function toEventHandler(handler) {
  if (isEventHandler(handler)) {
    return handler;
  }
  if (typeof handler !== "function") {
    throw new TypeError("Invalid handler. It should be a function:", handler);
  }
  return eventHandler((event) => {
    return callHandler(handler, event.req, event.res);
  });
}
function createEvent(req, res) {
  const event = {
    __is_event__: true,
    req,
    res,
    context: {}
  };
  event.event = event;
  req.event = event;
  req.context = event.context;
  req.req = req;
  req.res = res;
  res.event = event;
  res.res = res;
  res.req = res.req || {};
  res.req.res = res;
  res.req.req = req;
  return event;
}
function isEvent(input) {
  return "__is_event__" in input;
}

function createApp(options = {}) {
  const stack = [];
  const handler = createAppEventHandler(stack, options);
  const nodeHandler = async function(req, res) {
    const event = createEvent(req, res);
    try {
      await handler(event);
    } catch (err) {
      if (options.onError) {
        await options.onError(err, event);
      } else {
        if (!isError(err)) {
          console.error("[h3]", err);
        }
        await sendError(event, err, !!options.debug);
      }
    }
  };
  const app = nodeHandler;
  app.nodeHandler = nodeHandler;
  app.stack = stack;
  app.handler = handler;
  app.use = (arg1, arg2, arg3) => use(app, arg1, arg2, arg3);
  return app;
}
function use(app, arg1, arg2, arg3) {
  if (Array.isArray(arg1)) {
    arg1.forEach((i) => use(app, i, arg2, arg3));
  } else if (Array.isArray(arg2)) {
    arg2.forEach((i) => use(app, arg1, i, arg3));
  } else if (typeof arg1 === "string") {
    app.stack.push(normalizeLayer({ ...arg3, route: arg1, handler: arg2 }));
  } else if (typeof arg1 === "function") {
    app.stack.push(normalizeLayer({ ...arg2, route: "/", handler: arg1 }));
  } else {
    app.stack.push(normalizeLayer({ ...arg1 }));
  }
  return app;
}
function createAppEventHandler(stack, options) {
  const spacing = options.debug ? 2 : void 0;
  return eventHandler(async (event) => {
    event.req.originalUrl = event.req.originalUrl || event.req.url || "/";
    const reqUrl = event.req.url || "/";
    for (const layer of stack) {
      if (layer.route.length > 1) {
        if (!reqUrl.startsWith(layer.route)) {
          continue;
        }
        event.req.url = reqUrl.slice(layer.route.length) || "/";
      } else {
        event.req.url = reqUrl;
      }
      if (layer.match && !layer.match(event.req.url, event)) {
        continue;
      }
      const val = await layer.handler(event);
      if (event.res.writableEnded) {
        return;
      }
      const type = typeof val;
      if (type === "string") {
        return send(event, val, MIMES.html);
      } else if (isStream(val)) {
        return sendStream(event, val);
      } else if (type === "object" || type === "boolean" || type === "number") {
        if (val && val.buffer) {
          return send(event, val);
        } else if (val instanceof Error) {
          throw createError(val);
        } else {
          return send(event, JSON.stringify(val, null, spacing), MIMES.json);
        }
      }
    }
    if (!event.res.writableEnded) {
      throw createError({ statusCode: 404, statusMessage: "Not Found" });
    }
  });
}
function normalizeLayer(input) {
  let handler = input.handler || input.handle;
  if (handler.handler) {
    handler = handler.handler;
  }
  if (input.lazy) {
    handler = lazyEventHandler(handler);
  } else if (!isEventHandler(handler)) {
    handler = toEventHandler(handler);
  }
  return {
    route: withoutTrailingSlash(input.route),
    match: input.match,
    handler
  };
}

const RouterMethods = ["connect", "delete", "get", "head", "options", "post", "put", "trace"];
function createRouter() {
  const _router = createRouter$1({});
  const routes = {};
  const router = {};
  const addRoute = (path, handler, method) => {
    let route = routes[path];
    if (!route) {
      routes[path] = route = { handlers: {} };
      _router.insert(path, route);
    }
    if (Array.isArray(method)) {
      method.forEach((m) => addRoute(path, handler, m));
    } else {
      route.handlers[method] = toEventHandler(handler);
    }
    return router;
  };
  router.use = router.add = (path, handler, method) => addRoute(path, handler, method || "all");
  for (const method of RouterMethods) {
    router[method] = (path, handle) => router.add(path, handle, method);
  }
  router.handler = eventHandler((event) => {
    let path = event.req.url || "/";
    const queryUrlIndex = path.lastIndexOf("?");
    if (queryUrlIndex > -1) {
      path = path.substring(0, queryUrlIndex);
    }
    const matched = _router.lookup(path);
    if (!matched) {
      throw createError({
        statusCode: 404,
        name: "Not Found",
        statusMessage: `Cannot find any route matching ${event.req.url || "/"}.`
      });
    }
    const method = (event.req.method || "get").toLowerCase();
    const handler = matched.handlers[method] || matched.handlers.all;
    if (!handler) {
      throw createError({
        statusCode: 405,
        name: "Method Not Allowed",
        statusMessage: `Method ${method} is not allowed on this route.`
      });
    }
    const params = matched.params || {};
    event.event.context.params = params;
    event.req.context.params = params;
    return handler(event);
  });
  return router;
}

export { H3Error, MIMES, appendHeader, assertMethod, callHandler, createApp, createAppEventHandler, createError, createEvent, createRouter, defaultContentType, defineEventHandler, defineHandle, defineHandler, defineLazyEventHandler, defineLazyHandler, defineMiddleware, deleteCookie, dynamicEventHandler, eventHandler, handleCacheHeaders, isError, isEvent, isEventHandler, isMethod, isStream, lazyEventHandler, lazyHandle, promisifyHandle, promisifyHandler, send, sendError, sendRedirect, sendStream, setCookie, toEventHandler, use, useBase, useBody, useCookie, useCookies, useMethod, useQuery, useRawBody };
