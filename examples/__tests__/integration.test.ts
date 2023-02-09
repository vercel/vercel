import { readdirSync, lstatSync } from 'fs';
import { join } from 'path';

const {
  testDeployment,
} = require('../../test/lib/deployment/test-deployment.js');

jest.setTimeout(5 * 60 * 1000);

function getExamples() {
  const dirname = join(__dirname, '..');
  const examples = readdirSync(dirname)
    .map(example =>
      ({
        exampleName: example,
        examplePath: join(dirname, example),
      })
    )
    .filter(o =>
      !o.exampleName.startsWith('.') &&
      !o.exampleName.startsWith('_') &&
      lstatSync(o.examplePath).isDirectory()
    );
  return examples;
}

describe('examples', () => {
  const examples = getExamples();
  // TODO: separate each test into its own file
  it.each(examples)('should build and deploy $exampleName', async ({examplePath}) => {
    const promise = testDeployment(examplePath);
    await expect(promise).resolves.toBeDefined();
  });
});
