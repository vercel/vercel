import { parse as parseCookies } from 'cookie';
import { Stream } from 'stream';
import getRawBody from 'raw-body';
import { URL } from 'url';
import { parse as parseCT } from 'content-type';
import { NowRequest, NowResponse } from './types';

type NowListener = (req: NowRequest, res: NowResponse) => void | Promise<void>;

async function parseBody(req: NowRequest, limit: string = '1mb') {
  const contentType = parseCT(req.headers['content-type'] || 'text/plain');
  const { type, parameters } = contentType;
  const encoding = parameters.charset || 'utf-8';

  let buffer;

  try {
    buffer = await getRawBody(req, { encoding, limit });
  } catch (e) {
    if (e.type === 'entity.too.large') {
      throw new ApiError(413, `Body exceeded ${limit} limit`);
    } else {
      throw new ApiError(400, 'Invalid body');
    }
  }

  const body = buffer.toString();

  if (type === 'application/json' || type === 'application/ld+json') {
    return parseJson(body);
  } else if (type === 'application/x-www-form-urlencoded') {
    const qs = require('querystring');
    return qs.decode(body);
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

export function addHelpers(listener: NowListener): NowListener {
  return async function(req, res) {
    try {
      req.cookies = parseCookies(req.headers.cookie || '');
      req.query = parseQuery(req);
      req.body = await parseBody(req);

      res.status = statusCode => sendStatusCode(res, statusCode);
      res.send = data => sendData(res, data);
      res.json = data => sendJson(res, data);

      listener(req, res);
    } catch (err) {
      if (err instanceof ApiError) {
        sendError(res, err.statusCode, err.message);
      } else {
        throw err;
      }
    }
  };
}
