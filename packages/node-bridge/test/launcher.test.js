import { describe, beforeEach, it, expect } from 'vitest';
import { makeVercelLauncher, getVercelLauncher } from '../launcher';

describe('getVercelLauncher()', () => {
  const testCases = [
    { launcherType: 'Nodejs', handlerFile: 'node-handler.js' },
  ];
  if (parseInt(process.version.slice(1)) >= 18) {
    // web handler wrapper requires node18+
    testCases.push({
      launcherType: 'edge-light',
      handlerFile: 'edge-light-handler.js',
    });
  }

  describe.each(testCases)(
    'given $launcherType launcher type',
    ({ launcherType, handlerFile }) => {
      let launcher;
      beforeEach(() => {
        launcher = getVercelLauncher({
          launcherType,
          runtime: 'nodejs18.x',
          helpersPath: './helper.js',
          webHandlerPath: './web-handler.js',
          entrypointPath: `./test/fixtures/${handlerFile}`,
        });
      });

      it('builds bridge from a serverless function', async () => {
        const bridge = launcher();
        const bodyObject = { message: 'hello!' };
        const body = JSON.stringify(bodyObject);
        const headers = {
          foo: 'bar',
          'content-type': 'application/json',
          'content-length': body.length.toString(),
        };
        const result = await bridge.launcher(
          {
            httpMethod: 'POST',
            headers,
            path: '/apigateway',
            body,
          },
          {}
        );
        expect(result).toMatchObject({
          statusCode: 200,
          headers: expect.objectContaining({
            'content-type': 'application/json',
          }),
        });
        expect(
          JSON.parse(Buffer.from(result.body, 'base64').toString())
        ).toEqual({
          reqHeaders: expect.objectContaining(headers),
          reqBody: body,
          status: 'works',
        });
      });
    }
  );
});

describe('makeVercelLauncher()', () => {
  it('includes provided configuration', () => {
    const config = {
      launcherType: 'edge-light',
      entrypointPath: './fixtures/edge-light-handler.js',
      bridgePath: './bridge.js',
      helpersPath: './helper.js',
      webHandlerPath: './web-handler.js',
      sourcemapSupportPath: './source-map-support.js',
      runtime: 'nodejs18.x',
    };
    const launcherCode = makeVercelLauncher(config);
    expect(launcherCode).toContain(`"${config.launcherType}"`);
    expect(launcherCode).toContain(
      `const { Bridge } = require("${config.bridgePath}");`
    );
    expect(launcherCode).not.toContain(
      `require("${config.sourcemapSupportPath}");`
    );
    expect(launcherCode).toContain(
      `const entrypointPath = "${config.entrypointPath}";`
    );
    expect(launcherCode).toContain(`const shouldAddHelpers = false;`);
    expect(launcherCode).toContain(
      `const helpersPath = "${config.helpersPath}";`
    );
    expect(launcherCode).toContain(
      `const webHandlerPath = "${config.webHandlerPath}"`
    );
    expect(launcherCode).toContain(
      `const launcherType = "${config.launcherType}"`
    );
    expect(launcherCode).toContain(`const runtime = "${config.runtime}"`);
  });

  it('can include sourcemap support', () => {
    const config = {
      launcherType: 'edge-light',
      entrypointPath: './fixtures/edge-light-handler.js',
      bridgePath: './bridge.js',
      helpersPath: './helper.js',
      webHandlerPath: './web-handler.js',
      sourcemapSupportPath: './source-map-support.js',
      runtime: 'nodejs18.x',
      shouldAddSourcemapSupport: true,
    };
    const launcherCode = makeVercelLauncher(config);
    expect(launcherCode).toContain(
      `require("${config.sourcemapSupportPath}");`
    );
  });
});
