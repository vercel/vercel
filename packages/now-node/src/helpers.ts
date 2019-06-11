import { parse as parseCookies } from 'cookie';
import { Stream } from 'stream';
import { URL } from 'url';
import { parse as parseCT } from 'content-type';
import { NowRequest, NowResponse } from './types';
import { IncomingMessage, Server } from 'http';
import { Bridge } from './bridge';

function parseBody(req: IncomingMessage, body?: Buffer) {
  if (!body) {
    return null;
  }

  const { type } = parseCT(req.headers['content-type'] || 'text/plain');

  if (type === 'application/json' || type === 'application/ld+json') {
    return parseJson(body.toString());
  } else if (type === 'application/x-www-form-urlencoded') {
    const qs = require('querystring');
    return qs.decode(body.toString());
  } else {
    return body;
  }
}

// Parse `JSON` and handles invalid `JSON` strings
function parseJson(str: string) {
  try {
    return JSON.parse(str);
  } catch (e) {
    throw new ApiError(400, 'Invalid JSON');
  }
}

function parseQuery({ url = '/' }: NowRequest) {
  // we provide a placeholder base url because we only want searchParams
  const params = new URL(url, 'https://n').searchParams;

  const obj: { [key: string]: string | string[] } = {};
  for (const [key, value] of params) {
    obj[key] = value;
  }
  return obj;
}

function sendStatusCode(res: NowResponse, statusCode: number) {
  res.statusCode = statusCode;
  return res;
}

function sendData(res: NowResponse, body: any) {
  if (body === null) {
    res.end();
    return;
  }

  const contentType = res.getHeader('Content-Type');

  if (Buffer.isBuffer(body)) {
    if (!contentType) {
      res.setHeader('Content-Type', 'application/octet-stream');
    }
    res.setHeader('Content-Length', body.length);
    res.end(body);
    return;
  }

  if (body instanceof Stream) {
    if (!contentType) {
      res.setHeader('Content-Type', 'application/octet-stream');
    }
    body.pipe(res);
    return;
  }

  let str = body;

  // Stringify JSON body
  if (typeof body === 'object' || typeof body === 'number') {
    str = JSON.stringify(body);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }

  res.setHeader('Content-Length', Buffer.byteLength(str));
  res.end(str);
}

function sendJson(res: NowResponse, jsonBody: any): void {
  // Set header to application/json
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // Use send to handle request
  res.send(jsonBody);
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

      const c: undefined | string | string[] = req.headers.cookie;
      const cookies = Array.isArray(c) ? c.join(';') : c;

      req.cookies = parseCookies(cookies || '');
      req.query = parseQuery(req);
      req.body = parseBody(req, event.body);

      res.status = statusCode => sendStatusCode(res, statusCode);
      res.send = data => sendData(res, data);
      res.json = data => sendJson(res, data);

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
