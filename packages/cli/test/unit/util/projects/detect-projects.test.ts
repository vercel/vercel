import { join } from 'path';
import { detectProjects } from '../../../../src/util/projects/detect-projects';

const EXAMPLES_DIR = join(__dirname, '../../../../../../examples');

describe('detectProjects()', () => {
  it('should match "nextjs"', async () => {
    const dir = join(EXAMPLES_DIR, 'nextjs');
    const detected = await detectProjects(dir);
    console.log(detected);
  });
});
