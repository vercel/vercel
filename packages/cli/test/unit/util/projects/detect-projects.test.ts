import { join } from 'path';
import type { Framework } from '@vercel/frameworks';
import { detectProjects } from '../../../../src/util/projects/detect-projects';

const REPO_ROOT = join(__dirname, '../../../../../..');
const EXAMPLES_DIR = join(REPO_ROOT, 'examples');
const FS_DETECTORS_FIXTURES = join(
  REPO_ROOT,
  'packages/fs-detectors/test/fixtures'
);

function mapDetected(
  detected: Map<string, Framework[]>
): Array<[string, string[]]> {
  return [...detected.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dir, frameworks]) => [dir, frameworks.map(f => f.slug as string)]);
}

describe('detectProjects()', () => {
  it('should match 1 Project in "nextjs" example', async () => {
    const dir = join(EXAMPLES_DIR, 'nextjs');
    const detected = await detectProjects(dir);
    expect(mapDetected(detected)).toEqual([['', ['nextjs']]]);
  });

  it('should match 2 Projects in "storybook" example', async () => {
    const dir = join(EXAMPLES_DIR, 'storybook');
    const detected = await detectProjects(dir);
    expect(mapDetected(detected)).toEqual([['', ['nextjs', 'storybook']]]);
  });

  it('should match "30-double-nested-workspaces"', async () => {
    const dir = join(FS_DETECTORS_FIXTURES, '30-double-nested-workspaces');
    const detected = await detectProjects(dir);
    expect(mapDetected(detected)).toEqual([
      ['packages/backend/c', ['remix']],
      ['packages/backend/d', ['nextjs']],
      ['packages/frontend/a', ['hexo']],
      ['packages/frontend/b', ['ember']],
    ]);
  });
});
