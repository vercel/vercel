import type { ServerResponse, IncomingMessage } from 'node:http';
import { serializeBody } from '../utils.js';
import { PassThrough } from 'node:stream';
import { parse as parseURL } from 'node:url';
import { parse as parseContentType } from 'content-type';
import { parse as parseQS } from 'querystring';
import etag from 'etag';

type VercelRequestCookies = { [key: string]: string };
type VercelRequestQuery = { [key: string]: string | string[] };
type VercelRequestBody = any;

export type VercelRequest = IncomingMessage & {
  query: VercelRequestQuery;
  cookies: VercelRequestCookies;
  body: VercelRequestBody;
};

export type VercelResponse = ServerResponse & {
  send: (body: any) => VercelResponse;
  json: (jsonBody: any) => VercelResponse;
  status: (statusCode: number) => VercelResponse;
  redirect: (statusOrUrl: string | number, url?: string) => VercelResponse;
};

class ApiError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function normalizeContentType(contentType: string | undefined) {
  if (!contentType) {
    return 'text/plain';
  }

  const { type } = parseContentType(contentType);
  return type;
}

export function getBodyParser(body: Buffer, contentType: string | undefined) {
  return function parseBody(): VercelRequestBody {
    const type = normalizeContentType(contentType);

    if (type === 'application/json') {
      try {
        const str = body.toString();
        return str ? JSON.parse(str) : {};
      } catch (error) {
        throw new ApiError(400, 'Invalid JSON');
      }
    }

    if (type === 'application/octet-stream') return body;

    if (type === 'application/x-www-form-urlencoded') {
      // note: querystring.parse does not produce an iterable object
      // https://nodejs.org/api/querystring.html#querystring_querystring_parse_str_sep_eq_options
      return parseQS(body.toString());
    }

    if (type === 'text/plain') return body.toString();

    return undefined;
  };
}

function getQueryParser({ url = '/' }: IncomingMessage) {
  return function parseQuery(): VercelRequestQuery {
    return parseURL(url, true).query as VercelRequestQuery;
  };
}

function getCookieParser(req: IncomingMessage) {
  return function parseCookie(): VercelRequestCookies {
    const header: undefined | string | string[] = req.headers.cookie;
    if (!header) return {};
    const { parse } = require('cookie');
    return parse(Array.isArray(header) ? header.join(';') : header);
  };
}

function status(res: VercelResponse, statusCode: number): VercelResponse {
  res.statusCode = statusCode;
  return res;
}

function setCharset(type: string, charset: string) {
  const { parse, format } = require('content-type');
  const parsed = parse(type);
  parsed.parameters.charset = charset;
  return format(parsed);
}

function redirect(
  res: VercelResponse,
  statusOrUrl: string | number,
  url?: string
): VercelResponse {
  if (typeof statusOrUrl === 'string') {
    url = statusOrUrl;
    statusOrUrl = 307;
  }
  if (typeof statusOrUrl !== 'number' || typeof url !== 'string') {
    throw new Error(
      `Invalid redirect arguments. Please use a single argument URL, e.g. res.redirect('/destination') or use a status code and URL, e.g. res.redirect(307, '/destination').`
    );
  }
  res.writeHead(statusOrUrl, { Location: url }).end();
  return res;
}

function setLazyProp<T>(req: IncomingMessage, prop: string, getter: () => T) {
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

function createETag(body: any, encoding: 'utf8' | undefined) {
  const buf = !Buffer.isBuffer(body) ? Buffer.from(body, encoding) : body;
  return etag(buf, { weak: true });
}

function json(
  req: VercelRequest,
  res: VercelResponse,
  jsonBody: any
): VercelResponse {
  const body = JSON.stringify(jsonBody);
  if (!res.getHeader('content-type')) {
    res.setHeader('content-type', 'application/json; charset=utf-8');
  }
  return send(req, res, body);
}

function send(
  req: VercelRequest,
  res: VercelResponse,
  body: any
): VercelResponse {
  let chunk: unknown = body;
  let encoding: 'utf8' | undefined;

  switch (typeof chunk) {
    // string defaulting to html
    case 'string':
      if (!res.getHeader('content-type')) {
        res.setHeader('content-type', 'text/html');
      }
      break;
    case 'boolean':
    case 'number':
    case 'object':
      if (chunk === null) {
        chunk = '';
      } else if (Buffer.isBuffer(chunk)) {
        if (!res.getHeader('content-type')) {
          res.setHeader('content-type', 'application/octet-stream');
        }
      } else {
        return json(req, res, chunk);
      }
      break;
  }

  // write strings in utf-8
  if (typeof chunk === 'string') {
    encoding = 'utf8';

    // reflect this in content-type
    const type = res.getHeader('content-type');
    if (typeof type === 'string') {
      res.setHeader('content-type', setCharset(type, 'utf-8'));
    }
  }

  // populate Content-Length
  let len: number | undefined;
  if (chunk !== undefined) {
    if (Buffer.isBuffer(chunk)) {
      // get length of Buffer
      len = chunk.length;
    } else if (typeof chunk === 'string') {
      if (chunk.length < 1000) {
        // just calculate length small chunk
        len = Buffer.byteLength(chunk, encoding);
      } else {
        // convert chunk to Buffer and calculate
        const buf = Buffer.from(chunk, encoding);
        len = buf.length;
        chunk = buf;
        encoding = undefined;
      }
    } else {
      throw new Error(
        '`body` is not a valid string, object, boolean, number, Stream, or Buffer'
      );
    }

    if (len !== undefined) {
      res.setHeader('content-length', len);
    }
  }

  // populate ETag
  let etag: string | undefined;
  if (
    !res.getHeader('etag') &&
    len !== undefined &&
    (etag = createETag(chunk, encoding))
  ) {
    res.setHeader('etag', etag);
  }

  // strip irrelevant headers
  if (204 === res.statusCode || 304 === res.statusCode) {
    res.removeHeader('Content-Type');
    res.removeHeader('Content-Length');
    res.removeHeader('Transfer-Encoding');
    chunk = '';
  }

  if (req.method === 'HEAD') {
    // skip body for HEAD
    res.end();
  } else if (encoding) {
    // respond with encoding
    res.end(chunk, encoding);
  } else {
    // respond without encoding
    res.end(chunk);
  }

  return res;
}

function restoreBody(req: IncomingMessage, body: Buffer) {
  const replicateBody = new PassThrough();
  const on = replicateBody.on.bind(replicateBody);
  const originalOn = req.on.bind(req);
  req.read = replicateBody.read.bind(replicateBody);
  req.on = req.addListener = (name, cb) =>
    // @ts-expect-error
    name === 'data' || name === 'end' ? on(name, cb) : originalOn(name, cb);
  replicateBody.write(body);
  replicateBody.end();
}

async function readBody(req: IncomingMessage) {
  const body = (await serializeBody(req)) || Buffer.from('');
  restoreBody(req, body);
  return body;
}

export async function addHelpers(_req: IncomingMessage, _res: ServerResponse) {
  const req = _req as VercelRequest;
  const res = _res as VercelResponse;

  setLazyProp<VercelRequestCookies>(req, 'cookies', getCookieParser(req));
  setLazyProp<VercelRequestQuery>(req, 'query', getQueryParser(req));
  const contentType = req.headers['content-type'];
  const body =
    contentType === undefined ? Buffer.from('') : await readBody(req);
  setLazyProp<VercelRequestBody>(req, 'body', getBodyParser(body, contentType));

  res.status = statusCode => status(res, statusCode);
  res.redirect = (statusOrUrl, url) => redirect(res, statusOrUrl, url);
  res.send = body => send(req, res, body);
  res.json = jsonBody => json(req, res, jsonBody);
}
