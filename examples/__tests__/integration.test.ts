import { existsSync, lstatSync, readdirSync } from 'fs';
import { join } from 'path';

function getExamples() {
  const dirname = join(__dirname, '..');
  const examples = readdirSync(dirname)
    .map(example =>
      ({
        exampleName: example,
        examplePath: join(dirname, example),
        testPath: join(dirname, '__tests__', 'integration', `${example}.test.ts`),
      })
    )
    .filter(o =>
      !o.exampleName.startsWith('.') &&
      !o.exampleName.startsWith('_') &&
      lstatSync(o.examplePath).isDirectory()
    );
  return examples;
}

describe('should have test for each example', () => {
  it.each(getExamples())('should exist $exampleName', async ({testPath}) => {
    expect(existsSync(testPath)).toBeTruthy();
  });
});
