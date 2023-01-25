// Note: browser globals are only available because web handler requires node18 which provides them.
/* eslint-env node, browser */
const { createServer } = require('http');
const { transformToNodeHandler } = require('../web-handler.js');
const { getKillServer } = require('./run-test-server.js');

describe('Web handler wrapper', () => {
  let server;
  const nodeMajor = Number(process.versions.node.split('.')[0]);

  async function invokeWebHandler(handler, init) {
    // starts a server with provided handler and invokes it
    server = createServer(transformToNodeHandler(handler, 'nodejs18'));
    server.destroy = getKillServer(server);

    await new Promise((resolve, reject) =>
      server.listen(err => {
        err ? reject(err) : resolve();
      })
    );
    const response = await fetch(
      `http://localhost:${server.address().port}`,
      init
    );

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

  afterEach(() => server?.destroy());

  it('turns null response into an empty request', async () => {
    if (nodeMajor < 18) {
      console.log(`Skipping test on node@${nodeMajor}`);
      return;
    }
    const response = await invokeWebHandler(() => null);
    expect(response).toMatchObject({
      status: 200,
      statusText: 'OK',
      headers: { 'content-length': '0' },
      text: '',
    });
  });

  it('returns an empty response', async () => {
    if (nodeMajor < 18) {
      console.log(`Skipping test on node@${nodeMajor}`);
      return;
    }
    const response = await invokeWebHandler(() => new Response(null));
    expect(response).toMatchObject({
      status: 200,
      statusText: 'OK',
      headers: { 'content-length': '0' },
      text: '',
    });
  });

  it('can change response text and status', async () => {
    if (nodeMajor < 18) {
      console.log(`Skipping test on node@${nodeMajor}`);
      return;
    }
    const response = await invokeWebHandler(
      () => new Response(null, { status: 204, statusText: 'MY STATUS' })
    );
    expect(response).toMatchObject({
      status: 204,
      statusText: 'MY STATUS',
    });
  });

  it('returns a text response', async () => {
    if (nodeMajor < 18) {
      console.log(`Skipping test on node@${nodeMajor}`);
      return;
    }
    const response = await invokeWebHandler(() => new Response('OK'));
    expect(response).toMatchObject({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      text: 'OK',
    });
  });

  it('returns a json response', async () => {
    if (nodeMajor < 18) {
      console.log(`Skipping test on node@${nodeMajor}`);
      return;
    }
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
    if (nodeMajor < 18) {
      console.log(`Skipping test on node@${nodeMajor}`);
      return;
    }
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
    if (nodeMajor < 18) {
      console.log(`Skipping test on node@${nodeMajor}`);
      return;
    }
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

  it('uses host as request URL origin', async () => {
    if (nodeMajor < 18) {
      console.log(`Skipping test on node@${nodeMajor}`);
      return;
    }
    const host = 'my-awesome-website.org';
    const response = await invokeWebHandler(
      request => new Response(request.url),
      { headers: { host } }
    );
    expect(response).toMatchObject({ status: 200 });
    expect(response.text).toBe(`http://${host}/`);
  });

  it('default to vercel request URL origin', async () => {
    if (nodeMajor < 18) {
      console.log(`Skipping test on node@${nodeMajor}`);
      return;
    }
    const response = await invokeWebHandler(
      request => new Response(request.url),
      { headers: { host: '' } }
    );
    expect(response).toMatchObject({ status: 200 });
    expect(response.text).toBe(`https://vercel.com/`);
  });
});
