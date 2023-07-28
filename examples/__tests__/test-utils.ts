import { basename, join } from 'path';
import { lstatSync, readdirSync } from 'fs';

export async function deployExample(filename: string) {
  const { testDeployment } = require('../../test/lib/deployment/test-deployment.js');
  const example = basename(filename).replace(/\.test\.ts$/, '');
  await testDeployment(join(filename, '..', '..', '..', example));
}

export function getExamples() {
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
      o.exampleName !== 'node_modules' &&
      lstatSync(o.examplePath).isDirectory()
    );
  return examples;
}
