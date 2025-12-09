/* eslint-env jest */
process.env.NEXT_TELEMETRY_DISABLED = '1';

const path = require('path');
const builder = require('../..');
const {
  createRunBuildLambda,
} = require('../../../../test/lib/run-build-lambda');

const runBuildLambda = createRunBuildLambda(builder);

jest.setTimeout(360000);

describe('Static Metadata Integration Test', () => {
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('should build static metadata and verify Prerender outputs', async () => {
    const { buildResult } = await runBuildLambda(
      path.join(__dirname, '../fixtures/00-static-metadata-test')
    );
    const { output } = buildResult;

    // Verify that static metadata files are generated as Prerender outputs
    expect(output['favicon.ico']).toBeDefined();
    expect(output['favicon.ico'].type).toBe('FileFsRef');

    expect(output['icon.svg']).toBeDefined();
    expect(output['icon.svg'].type).toBe('FileFsRef');

    expect(output['manifest.json']).toBeDefined();
    expect(output['manifest.json'].type).toBe('FileFsRef');

    expect(output['robots.txt']).toBeDefined();
    expect(output['robots.txt'].type).toBe('FileFsRef');

    expect(output['sitemap.xml']).toBeDefined();
    expect(output['sitemap.xml'].type).toBe('FileFsRef');

    expect(output['twitter-image.png']).toBeDefined();
    expect(output['twitter-image.png'].type).toBe('FileFsRef');

    // Verify opengraph-image route handler, it's supposed not to be built as static file
    expect(output['opengraph-image.png']).toBeDefined();
    expect(output['opengraph-image.png'].type).toBe('Prerender');

    // Verify main page is also Prerender
    expect(output['index']).toBeDefined();
    expect(output['index'].type).toBe('Prerender');

    // Verify grouped route static metadata
    expect(output['foo/icon-mxheo5.png']).toBeDefined();
    expect(output['foo/icon-mxheo5.png'].type).toBe('FileFsRef');

    // Verify dynamic route static metadata
    expect(output['dynamic/[id]/sitemap.xml']).toBeDefined();
    expect(output['dynamic/[id]/sitemap.xml'].type).toBe('FileFsRef');

    expect(output['dynamic/[id]/opengraph-image2.png']).toBeDefined();
    expect(output['dynamic/[id]/opengraph-image2.png'].type).toBe('FileFsRef');

    // Verify catch-all route static metadata
    expect(output['dynamic-catch/[...arg]/icon.svg']).toBeDefined();
    expect(output['dynamic-catch/[...arg]/icon.svg'].type).toBe('FileFsRef');

    expect(output['dynamic-catch-all/[[...arg]]/icon.svg']).toBeDefined();
    expect(output['dynamic-catch-all/[[...arg]]/icon.svg'].type).toBe(
      'FileFsRef'
    );
  });
});
