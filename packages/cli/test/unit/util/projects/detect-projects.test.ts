import { describe, it, expect } from 'vitest';
import { join } from 'path';
import {
  detectProjects,
  type DetectedProject,
} from '../../../../src/util/projects/detect-projects';
import { Runtime } from '@vercel/frameworks';

const REPO_ROOT = join(__dirname, '../../../../../..');
const EXAMPLES_DIR = join(REPO_ROOT, 'examples');
const FS_DETECTORS_FIXTURES = join(
  REPO_ROOT,
  'packages/fs-detectors/test/fixtures'
);

function mapDetected(
  detected: Map<string, DetectedProject[]>
): Array<[string, [string, Runtime | undefined][]]> {
  return [...detected.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dir, projects]) => [
      dir,
      projects.map(p => [p.framework.slug as string, p.runtime]),
    ]);
}

describe('detectProjects()', () => {
  it('should match 1 Project in "nextjs" example', async () => {
    const dir = join(EXAMPLES_DIR, 'nextjs');
    const detected = await detectProjects(dir);
    expect(mapDetected(detected)).toEqual([['', [['nextjs', Runtime.Node]]]]);
  });

  it('should match "30-double-nested-workspaces"', async () => {
    const dir = join(FS_DETECTORS_FIXTURES, '30-double-nested-workspaces');
    const detected = await detectProjects(dir);
    expect(mapDetected(detected)).toEqual([
      ['packages/backend/c', [['remix', Runtime.Node]]],
      ['packages/backend/d', [['nextjs', Runtime.Node]]],
      ['packages/frontend/a', [['hexo', Runtime.Node]]],
      ['packages/frontend/b', [['ember', Runtime.Node]]],
    ]);
  });
});
