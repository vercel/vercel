import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'http';
import { listen } from 'async-listen';
import { request } from 'undici';
import {
  addHelpers,
  getBodyParser,
  type VercelRequest,
  type VercelResponse,
} from '../../../src/serverless-functions/helpers';

const servers: Server[] = [];

async function serve(
  handler: (req: VercelRequest, res: VercelResponse) => void | Promise<void>
) {
  const server = createServer(async (req, res) => {
    await addHelpers(req, res);
    await handler(req as VercelRequest, res as VercelResponse);
  });
  servers.push(server);
  return listen(server, { host: '127.0.0.1', port: 0 });
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        server =>
          new Promise<void>((resolve, reject) =>
            server.close(error => (error ? reject(error) : resolve()))
          )
      )
  );
});

describe('serverless-functions/helpers', () => {
  describe('getBodyParser', () => {
    it('content type undefined should return the original string', () => {
      const rawBody = 'body content';
      const body = Buffer.from(rawBody);
      const result = getBodyParser(body, undefined)();
      expect(result).toBe(rawBody);
    });

    it('content type "text/plain" should return the original string', () => {
      const rawBody = 'body content';
      const body = Buffer.from(rawBody);
      const result = getBodyParser(body, 'text/plain')();
      expect(result).toBe(rawBody);
    });

    it('content type "application/octet-stream" should return the body buffer', () => {
      const rawBody = 'body content';
      const body = Buffer.from(rawBody);
      const result = getBodyParser(body, 'application/octet-stream')();
      expect(result).toBe(body);
    });

    it('content type "application/x-www-form-urlencoded" should return the parsed query string', () => {
      const rawBody = 'foo=bar&baz=zim';
      const body = Buffer.from(rawBody);

      const result = getBodyParser(body, 'application/x-www-form-urlencoded')();
      expect(result).toEqual({
        foo: 'bar',
        baz: 'zim',
      });
    });

    it('content type "application/json" should return the parsed object', () => {
      const rawBody = '{"foo": "bar", "baz": "zim"}';
      const body = Buffer.from(rawBody);
      const result = getBodyParser(body, 'application/json')();
      expect(result).toEqual({
        foo: 'bar',
        baz: 'zim',
      });
    });

    it('content type "application/json" should throw when parsing bad json', () => {
      const rawBody = 'not valid json';
      const body = Buffer.from(rawBody);
      expect(() => {
        getBodyParser(body, 'application/json')();
      }).toThrow('Invalid JSON');
    });
  });

  describe('request helper contract', () => {
    it('parses duplicate query values and cookies lazily', async () => {
      const url = await serve((req, res) => {
        res.json({ query: req.query, cookies: req.cookies });
      });

      const response = await request(`${url}?tag=one&tag=two`, {
        headers: { cookie: 'first=1; second=2' },
      });

      expect(await response.body.json()).toEqual({
        query: { tag: ['one', 'two'] },
        cookies: { first: '1', second: '2' },
      });
    });

    it('allows helper properties to be overwritten', async () => {
      const url = await serve((req, res) => {
        req.query = { replaced: 'query' };
        req.cookies = { replaced: 'cookie' };
        req.body = { replaced: 'body' };
        res.json({ query: req.query, cookies: req.cookies, body: req.body });
      });

      const response = await request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"original":true}',
      });

      expect(await response.body.json()).toEqual({
        query: { replaced: 'query' },
        cookies: { replaced: 'cookie' },
        body: { replaced: 'body' },
      });
    });

    it('restores the request stream after parsing req.body', async () => {
      const url = await serve((req, res) => {
        const parsedBody = req.body;
        let streamedBody = '';
        req.on('data', chunk => {
          streamedBody += chunk;
        });
        req.on('end', () => res.json({ parsedBody, streamedBody }));
      });

      const response = await request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"restored":true}',
      });

      expect(await response.body.json()).toEqual({
        parsedBody: { restored: true },
        streamedBody: '{"restored":true}',
      });
    });
  });

  describe('response helper contract', () => {
    it('chains status() and json() and preserves an existing content type', async () => {
      const url = await serve((_req, res) => {
        res.setHeader('content-type', 'application/problem+json');
        expect(res.status(422)).toBe(res);
        expect(res.json({ error: true })).toBe(res);
      });

      const response = await request(url);

      expect(response.statusCode).toBe(422);
      expect(response.headers['content-type']).toBe(
        'application/problem+json; charset=utf-8'
      );
      expect(response.headers.etag).toMatch(/^W\//);
      expect(await response.body.json()).toEqual({ error: true });
    });

    it.each([
      { name: 'string', value: 'hello', type: 'text/html; charset=utf-8' },
      {
        name: 'buffer',
        value: Buffer.from('hello'),
        type: 'application/octet-stream',
      },
      { name: 'number', value: 42, type: 'application/json; charset=utf-8' },
      { name: 'boolean', value: true, type: 'application/json; charset=utf-8' },
      { name: 'null', value: null, type: undefined },
    ])('sends $name values with compatibility headers', async ({
      value,
      type,
    }) => {
      const url = await serve((_req, res) => {
        res.send(value);
      });

      const response = await request(url);

      expect(response.headers['content-type']).toBe(type);
      expect(await response.body.text()).toBe(
        value === null
          ? ''
          : Buffer.isBuffer(value)
            ? 'hello'
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value)
      );
    });

    it('removes entity headers and body for 204 responses', async () => {
      const url = await serve((_req, res) => {
        res.status(204).send('must not be sent');
      });

      const response = await request(url);

      expect(response.statusCode).toBe(204);
      expect(response.headers['content-type']).toBeUndefined();
      expect(response.headers['content-length']).toBeUndefined();
      expect(await response.body.text()).toBe('');
    });

    it('sends headers but no body for HEAD requests', async () => {
      const url = await serve((_req, res) => {
        res.send('head body');
      });

      const response = await request(url, { method: 'HEAD' });

      expect(response.headers['content-length']).toBe('9');
      expect(response.headers.etag).toMatch(/^W\//);
      expect(await response.body.text()).toBe('');
    });

    it.each([
      { args: ['/destination'] as const, status: 307 },
      { args: [308, '/permanent'] as const, status: 308 },
    ])('redirects with status $status', async ({ args, status }) => {
      const url = await serve((_req, res) => {
        res.redirect(...args);
      });

      const response = await request(url, { maxRedirections: 0 });

      expect(response.statusCode).toBe(status);
      expect(response.headers.location).toBe(args.at(-1));
    });

    it('throws for invalid redirect arguments', async () => {
      const url = await serve((_req, res) => {
        expect(() => res.redirect(307)).toThrow('Invalid redirect arguments');
        res.end('checked');
      });

      const response = await request(url);
      expect(await response.body.text()).toBe('checked');
    });
  });
});
