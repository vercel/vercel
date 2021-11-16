import { join } from 'path';
import { promises as fsp } from 'fs';
import { build } from '../src';
import { Response } from 'node-fetch';

describe('build()', () => {
  beforeEach(() => {
    //@ts-ignore
    global.Response = Response;
  });
  afterEach(() => {
    //@ts-ignore
    delete global.Response;
    //@ts-ignore
    delete global._ENTRIES;
  });
  it('should build simple middleware', async () => {
    const fixture = join(__dirname, 'fixtures/simple');
    await build({
      workPath: fixture,
    });

    const middlewareManifest = JSON.parse(
      await fsp.readFile(
        join(fixture, '.output/server/middleware-manifest.json'),
        'utf8'
      )
    );
    expect(middlewareManifest).toMatchSnapshot();

    const outputFile = join(fixture, '.output/server/pages/_middleware.js');
    expect(await fsp.stat(outputFile)).toBeTruthy();

    require(outputFile);
    //@ts-ignore
    const middleware = global._ENTRIES['middleware_pages/_middleware'].default;
    expect(typeof middleware).toStrictEqual('function');
    const handledResponse = await middleware({
      request: {
        url: 'http://google.com',
      },
    });
    const unhandledResponse = await middleware({
      request: {
        url: 'literallyanythingelse',
      },
    });
    expect(String(handledResponse.response.body)).toEqual('Hi from the edge!');
    expect(
      (handledResponse.response as Response).headers.get('x-middleware-next')
    ).toEqual(null);
    expect(unhandledResponse.response.body).toEqual(null);
    expect(
      (unhandledResponse.response as Response).headers.get('x-middleware-next')
    ).toEqual('1');
  });
});
