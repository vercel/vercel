const path = require('path');
const fs = require('fs-extra');
const { createRunBuildLambda } = require('../../../../test/lib/run-build-lambda');
const builder = require('../../');

const runBuildLambda = createRunBuildLambda(builder);

jest.setTimeout(360000);

it('should handle metadata files correctly', async () => {
  const { buildResult } = await runBuildLambda(
    path.join(__dirname)
  );

  expect(buildResult.output['opengraph-image.png']).toBeDefined();
  expect(buildResult.output['opengraph-image.png'].type).toBe('FileFsRef');
  
  expect(buildResult.output['favicon.jpg']).toBeDefined();
  expect(buildResult.output['favicon.jpg'].type).toBe('FileFsRef');
  
  expect(buildResult.output['opengraph-image']).toBeDefined();
  expect(buildResult.output['opengraph-image'].type).toBe('Lambda');
  
  const metadataDir = path.join(
    buildResult.workPath,
    '.next',
    'server',
    '_metadata'
  );
  expect(fs.existsSync(metadataDir)).toBe(true);
  
  expect(fs.existsSync(path.join(metadataDir, 'opengraph-image.png'))).toBe(true);
  expect(fs.existsSync(path.join(metadataDir, 'favicon.jpg'))).toBe(true);
});
