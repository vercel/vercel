// Note: browser globals are only available because web handler requires node18 which provides them.
/* eslint-env node, browser */
const { createServer } = require('http');
const { transformToNodeHandler } = require('../web-handler.js');

// web handler wrapper requires node18+
(parseInt(process.version.slice(1)) < 18 ? describe.skip : describe)(
  'Web handler wrapper',
  () => {
    let server;

    async function invokeWebHandler(handler) {
      // starts a server with provided handler and invokes it
      server = createServer(transformToNodeHandler(handler, 'nodejs18'));

      // TODO fetch connections are hanging, despite the lack of keepalive.
      // inspire from https://github.com/isaacs/server-destroy/blob/master/index.js to force-close them.
      const connections = new Map();
      server.on('connection', connection => {
        const key = `${connection.remoteAddress}:${connection.remotePort}`;
        connections.set(key, connection);
        connection.on('close', () => connections.delete(key));
      });
      server.destroy = done => {
        for (const connection of connections.values()) {
          connection.destroy();
        }
        server.close(done);
      };

      await new Promise((resolve, reject) =>
        server.listen(err => {
          err ? reject(err) : resolve();
        })
      );
      const response = await fetch(`http://localhost:${server.address().port}`);

      // extract response content to ease expectations
      const headers = {};
      for (const [name, value] of await response.headers) {
        headers[name] = value;
      }
      return {
        status: response.status,
        statusText: response.statusText,
        headers,
        text: await response.clone().text(),
        json:
          headers['content-type'] === 'application/json'
            ? await response.json()
            : undefined,
      };
    }

    afterEach(done => {
      server.destroy(done);
    });

    it('turns null response into an empty request', async () => {
      const response = await invokeWebHandler(() => null);
      expect(response).toMatchObject({
        status: 200,
        statusText: 'OK',
        headers: { 'content-length': '0' },
        text: '',
      });
    });

    it('returns an empty response', async () => {
      const response = await invokeWebHandler(() => new Response(null));
      expect(response).toMatchObject({
        status: 200,
        statusText: 'OK',
        headers: { 'content-length': '0' },
        text: '',
      });
    });

    it('can change response text and status', async () => {
      const response = await invokeWebHandler(
        () => new Response(null, { status: 204, statusText: 'MY STATUS' })
      );
      expect(response).toMatchObject({
        status: 204,
        statusText: 'MY STATUS',
      });
    });

    it('returns a text response', async () => {
      const response = await invokeWebHandler(() => new Response('OK'));
      expect(response).toMatchObject({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        text: 'OK',
      });
    });

    it('returns a json response', async () => {
      const json = { works: 'jsut right' };
      const response = await invokeWebHandler(() => Response.json(json));
      expect(response).toMatchObject({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        json,
      });
    });

    it('can configure response headers', async () => {
      const response = await invokeWebHandler(() => {
        const response = new Response();
        response.headers.set('x-vercel-custom', '1');
        return response;
      });
      expect(response).toMatchObject({
        status: 200,
        headers: { 'x-vercel-custom': '1' },
      });
    });

    it('returns a streams of data', async () => {
      const data = ['lorem', 'ipsum', 'nec', 'mergitur'];

      const response = await invokeWebHandler(
        () =>
          new Response(
            new ReadableStream({
              start(controller) {
                let rank = 0;
                function write() {
                  controller.enqueue(data[rank++]);
                  if (rank < data.length) {
                    setTimeout(write, 500);
                  } else {
                    controller.close();
                  }
                }
                write();
              },
            })
          )
      );
      expect(response).toMatchObject({
        status: 200,
        text: data.join(''),
      });
    });
  }
);
