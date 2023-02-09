import { basename, join } from 'path';
import { testDeployment } from '../../test/lib/deployment/test-deployment.js';

export async function deployExample(filename: string) {
  const example = basename(filename).replace(/\.test\.ts$/, '');
  await testDeployment(join(filename, '..', '..', '..', example));
}
