import { readFileSync, existsSync } from 'fs';
import { test, expect } from 'vitest';

const REPO_JSON_PATH = '.vercel/repo.json';

/**
 * Link monorepo eval: we expect the agent to have used `vc link --repo` (or
 * `vercel link --repo`) so that a root `.vercel/repo.json` exists with one
 * project per workspace in /apps, and that the right framework was used for
 * each app (implied by separate projects per directory). We do not put
 * --repo or framework hints in the prompt; the agent must choose the
 * correct flow.
 */
test('.vercel/repo.json exists at repo root', () => {
  expect(existsSync(REPO_JSON_PATH)).toBe(true);
});

test('repo.json has expected structure with projects for apps', () => {
  const raw = readFileSync(REPO_JSON_PATH, 'utf-8');
  const repo = JSON.parse(raw) as {
    remoteName?: string;
    projects?: {
      id: string;
      name: string;
      directory: string;
      orgId?: string;
    }[];
  };
  expect(repo).toHaveProperty('projects');
  expect(Array.isArray(repo.projects)).toBe(true);
  expect(repo.projects!.length).toBeGreaterThanOrEqual(2);

  const directories = new Set(repo.projects!.map(p => p.directory));
  // Should have one project per app under apps/ (e.g. apps/nextjs, apps/hono)
  const appDirs = [...directories].filter(d => d.startsWith('apps/'));
  expect(appDirs.length).toBeGreaterThanOrEqual(2);

  repo.projects!.forEach(p => {
    expect(p).toHaveProperty('id');
    expect(p).toHaveProperty('name');
    expect(p).toHaveProperty('directory');
  });
});

test('agent used vc link --repo (not single-project link)', () => {
  expect(existsSync('command-used.txt')).toBe(true);

  const content = readFileSync('command-used.txt', 'utf-8').trim();
  expect(content.length).toBeGreaterThan(0);

  const hasLink =
    content.includes('vercel link') || content.includes('vc link');
  expect(hasLink).toBe(true);

  const hasRepoFlag = content.includes('--repo') || content.includes('-r ');
  expect(hasRepoFlag).toBe(true);
});
