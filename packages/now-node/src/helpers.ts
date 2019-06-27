import {
  NowRequest,
  NowResponse,
  NowRequestCookies,
  NowRequestQuery,
  NowRequestBody,
} from './types';
import { Stream } from 'stream';
import { Server } from 'http';
import { Bridge } from './bridge';

function getBodyParser(req: NowRequest, body: Buffer) {
  return function parseBody(): NowRequestBody {
    if (!req.headers['content-type']) {
      return undefined;
    }

    const { parse: parseCT } = require('content-type');
    const { type } = parseCT(req.headers['content-type']);

    if (type === 'application/json') {
      try {
        return JSON.parse(body.toString());
      } catch (error) {
        throw new ApiError(400, 'Invalid JSON');
      }
    }

    if (type === 'application/octet-stream') {
      return body;
    }

    if (type === 'application/x-www-form-urlencoded') {
      const { parse: parseQS } = require('querystring');
      // remark : querystring.parse does not produce an iterable object
      // https://nodejs.org/api/querystring.html#querystring_querystring_parse_str_sep_eq_options
      return parseQS(body.toString());
    }

    if (type === 'text/plain') {
      return body.toString();
    }

    return undefined;
  };
}

function getQueryParser({ url = '/' }: NowRequest) {
  return function parseQuery(): NowRequestQuery {
    const { URL } = require('url');
    // we provide a placeholder base url because we only want searchParams
    const params = new URL(url, 'https://n').searchParams;

    const query: { [key: string]: string | string[] } = {};
    for (const [key, value] of params) {
      query[key] = value;
    }

    return query;
  };
}

function getCookieParser(req: NowRequest) {
  return function parseCookie(): NowRequestCookies {
    const header: undefined | string | string[] = req.headers.cookie;

    if (!header) {
      return {};
    }

    const { parse } = require('cookie');
    return parse(Array.isArray(header) ? header.join(';') : header);
  };
}

function status(res: NowResponse, statusCode: number): NowResponse {
  res.statusCode = statusCode;
  return res;
}

function setContentHeaders(
  res: NowResponse,
  type: string,
  length?: number
): void {
  if (!res.getHeader('content-type')) {
    res.setHeader('content-type', type);
  }

  if (length !== undefined) {
    res.setHeader('content-length', length);
  }
}

function send(res: NowResponse, body: any) {
  const t = typeof body;

  if (body === null || t === 'undefined') {
    res.end();
    return res;
  }

  if (t === 'string') {
    setContentHeaders(
      res,
      'text/plain; charset=utf-8',
      Buffer.byteLength(body)
    );
    res.end(body);
    return res;
  }

  if (Buffer.isBuffer(body)) {
    setContentHeaders(res, 'application/octet-stream', body.length);
    res.end(body);
    return res;
  }

  if (body instanceof Stream) {
    setContentHeaders(res, 'application/octet-stream');
    body.pipe(res);
    return res;
  }

  switch (t) {
    case 'boolean':
    case 'number':
    case 'bigint':
    case 'object':
      return json(res, body);
  }

  throw new Error(
    '`body` is not a valid string, object, boolean, number, Stream, or Buffer'
  );
}

function json(res: NowResponse, jsonBody: any): NowResponse {
  switch (typeof jsonBody) {
    case 'object':
    case 'boolean':
    case 'number':
    case 'bigint':
    case 'string':
      const body = JSON.stringify(jsonBody);
      setContentHeaders(
        res,
        'application/json; charset=utf-8',
        Buffer.byteLength(body)
      );
      res.end(body);
      return res;
  }

  throw new Error(
    '`jsonBody` is not a valid object, boolean, string, number, or null'
  );
}

export class ApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function sendError(
  res: NowResponse,
  statusCode: number,
  message: string
) {
  res.statusCode = statusCode;
  res.statusMessage = message;
  res.end();
}

function setLazyProp<T>(req: NowRequest, prop: string, getter: () => T) {
  const opts = { configurable: true, enumerable: true };
  const optsReset = { ...opts, writable: true };

  Object.defineProperty(req, prop, {
    ...opts,
    get: () => {
      const value = getter();
      // we set the property on the object to avoid recalculating it
      Object.defineProperty(req, prop, { ...optsReset, value });
      return value;
    },
    set: value => {
      Object.defineProperty(req, prop, { ...optsReset, value });
    },
  });
}

export function createServerWithHelpers(
  listener: (req: NowRequest, res: NowResponse) => void | Promise<void>,
  bridge: Bridge
) {
  const server = new Server(async (_req, _res) => {
    const req = _req as NowRequest;
    const res = _res as NowResponse;

    try {
      const reqId = req.headers['x-now-bridge-request-id'];

      // don't expose this header to the client
      delete req.headers['x-now-bridge-request-id'];

      if (typeof reqId !== 'string') {
        throw new ApiError(500, 'Internal Server Error');
      }

      const event = bridge.consumeEvent(reqId);

      setLazyProp<NowRequestCookies>(req, 'cookies', getCookieParser(req));
      setLazyProp<NowRequestQuery>(req, 'query', getQueryParser(req));
      setLazyProp<NowRequestBody>(req, 'body', getBodyParser(req, event.body));

      res.status = statusCode => status(res, statusCode);
      res.send = body => send(res, body);
      res.json = jsonBody => json(res, jsonBody);

      await listener(req, res);
    } catch (err) {
      if (err instanceof ApiError) {
        sendError(res, err.statusCode, err.message);
      } else {
        throw err;
      }
    }
  });

  return server;
}
