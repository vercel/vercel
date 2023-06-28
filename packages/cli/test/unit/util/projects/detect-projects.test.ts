import { join } from 'path';
import { detectProjects } from '../../../../src/util/projects/detect-projects';

const REPO_ROOT = join(__dirname, '../../../../../..');
const EXAMPLES_DIR = join(REPO_ROOT, 'examples');
const FS_DETECTORS_FIXTURES = join(
  REPO_ROOT,
  'packages/fs-detectors/test/fixtures'
);

describe('detectProjects()', () => {
  it('should match "nextjs" example', async () => {
    const dir = join(EXAMPLES_DIR, 'nextjs');
    const detected = await detectProjects(dir);
    expect([...detected.entries()]).toEqual([['', 'nextjs']]);
  });

  it('should match "30-double-nested-workspaces"', async () => {
    const dir = join(FS_DETECTORS_FIXTURES, '30-double-nested-workspaces');
    const detected = await detectProjects(dir);
    expect(
      [...detected.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    ).toEqual([
      ['packages/backend/c', 'remix'],
      ['packages/backend/d', 'nextjs'],
      ['packages/frontend/a', 'hexo'],
      ['packages/frontend/b', 'ember'],
    ]);
  });
});
