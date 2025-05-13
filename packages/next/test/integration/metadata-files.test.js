process.env.NEXT_TELEMETRY_DISABLED = '1';

const path = require('path');
const fs = require('fs-extra');
const builder = require('../../');
const {
  createRunBuildLambda,
} = require('../../../../test/lib/run-build-lambda');

const runBuildLambda = createRunBuildLambda(builder);

jest.setTimeout(360000);

it('should handle metadata files correctly', async () => {
  const {
    buildResult: { output, workPath },
  } = await runBuildLambda(
    path.join(__dirname, '../fixtures/00-metadata-files')
  );

  expect(output['pages/opengraph-image.png']).toBeDefined();
  expect(output['pages/opengraph-image.png'].type).toBe('FileFsRef');

  expect(output['pages/favicon.jpg']).toBeDefined();
  expect(output['pages/favicon.jpg'].type).toBe('FileFsRef');

  expect(output['pages/opengraph-image']).toBeDefined();
  expect(output['pages/opengraph-image'].type).toBe('Lambda');

  const metadataDir = path.join(workPath, '.next', 'server', '_metadata');
  expect(fs.existsSync(metadataDir)).toBe(true);

  expect(fs.existsSync(path.join(metadataDir, 'opengraph-image.png'))).toBe(
    true
  );
  expect(fs.existsSync(path.join(metadataDir, 'favicon.jpg'))).toBe(true);
});
