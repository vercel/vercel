import { basename, join } from 'path';
import { testDeployment } from '../../test/lib/deployment/test-deployment.js';

export async function deployExample(filename: string) {
  const example = basename(filename).slice(0, -8);
  await testDeployment(join(filename, '..', '..', '..', example));
}
