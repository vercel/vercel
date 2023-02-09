const { readdirSync } = require('fs');
const { join } = require('path');

const {
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(5 * 60 * 1000);

function getExamples() {
  const examples = readdirSync(__dirname)
    .map(example =>
      ({
        exampleName: example,
        examplePath: join(__dirname, example),
      })
    )
    .filter(o =>
      lstatSync(o.examplePath).isDirectory()
    );
  return examples;
}

describe('examples', () => {
  const examples = getExamples();

  it.each(examples)('should build and deploy $exampleName', async ({examplePath}) => {
    const promise = testDeployment(examplePath);
    await expect(promise).resolves.toBeDefined();
  });
});
