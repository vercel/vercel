import { describe, expect, it } from 'vitest';
import type { Org } from '@vercel-internals/types';
import {
  buildLinkDemoPayload,
  getLinkDemoScenarioIds,
} from '../../../../src/util/link/link-demo-scenarios';

const demoOrg: Org = { type: 'team', id: 'team_demo', slug: 'jsee' };

describe('link-demo-scenarios', () => {
  it('exports a non-empty scenario id list', () => {
    expect(getLinkDemoScenarioIds().length).toBeGreaterThan(0);
  });

  it.each(
    getLinkDemoScenarioIds()
  )('buildLinkDemoPayload(%s) returns all buckets', id => {
    const data = buildLinkDemoPayload(id, demoOrg);
    expect(Array.isArray(data.gitLinkedProjects)).toBe(true);
    expect(
      Array.isArray(data.gitLinkedProjectsWithMisconfiguredRootDirectory)
    ).toBe(true);
    expect(Array.isArray(data.nonGitLinkedProjects)).toBe(true);
    expect(data.detectedProjects).toBeInstanceOf(Map);
  });

  it('add-mixed: `vercel link add` — git-linked, misconfigured, non-git, and detected rows', () => {
    const data = buildLinkDemoPayload('add-mixed', demoOrg);
    expect(data.gitLinkedProjects.length).toBeGreaterThan(0);
    expect(
      data.gitLinkedProjectsWithMisconfiguredRootDirectory.length
    ).toBeGreaterThan(0);
    expect(data.nonGitLinkedProjects.length).toBeGreaterThan(0);
    expect(data.detectedProjects.size).toBeGreaterThan(0);
  });

  it('add-local-one: detected-only with a single root (`vc link --repo` suppresses this)', () => {
    const data = buildLinkDemoPayload('add-local-one', demoOrg);
    expect(data.gitLinkedProjects).toHaveLength(0);
    expect(data.gitLinkedProjectsWithMisconfiguredRootDirectory).toHaveLength(
      0
    );
    expect(data.nonGitLinkedProjects).toHaveLength(0);
    expect(data.detectedProjects.size).toBe(1);
  });

  it('add-local-many: no API projects and several detected roots', () => {
    const data = buildLinkDemoPayload('add-local-many', demoOrg);
    expect(data.gitLinkedProjects).toHaveLength(0);
    expect(data.gitLinkedProjectsWithMisconfiguredRootDirectory).toHaveLength(
      0
    );
    expect(data.nonGitLinkedProjects).toHaveLength(0);
    expect(data.detectedProjects.size).toBe(3);
    expect(data.detectedProjects.get('apps/web')?.[0]?.slug).toBe('nextjs');
    expect(data.detectedProjects.get('apps/api')?.[0]?.slug).toBe('hono');
    expect(data.detectedProjects.get('packages/widget')?.[0]?.slug).toBe(
      'vite'
    );
  });

  it('add-non-git-detect: non-git; Vercel root "" vs suggested apps/web + detect', () => {
    const data = buildLinkDemoPayload('add-non-git-detect', demoOrg);
    expect(data.gitLinkedProjects).toHaveLength(0);
    expect(data.gitLinkedProjectsWithMisconfiguredRootDirectory).toHaveLength(
      0
    );
    expect(data.nonGitLinkedProjects).toHaveLength(1);
    const row = data.nonGitLinkedProjects[0];
    expect(row.directory).toBe('');
    expect(row.suggestedDirectory).toBe('apps/web');
    expect(data.detectedProjects.get('apps/web')?.[0]?.slug).toBe('nextjs');
  });

  it('add-non-git-solo: sole non-git with mismatch and no detected rows', () => {
    const data = buildLinkDemoPayload('add-non-git-solo', demoOrg);
    expect(data.gitLinkedProjects).toHaveLength(0);
    expect(data.gitLinkedProjectsWithMisconfiguredRootDirectory).toHaveLength(
      0
    );
    expect(data.nonGitLinkedProjects).toHaveLength(1);
    expect(data.detectedProjects.size).toBe(0);
    expect(data.nonGitLinkedProjects[0].suggestedDirectory).toBe('apps/web');
  });

  it('add-misconfig-solo: a single misconfigured row only', () => {
    const data = buildLinkDemoPayload('add-misconfig-solo', demoOrg);
    expect(data.gitLinkedProjects).toHaveLength(0);
    expect(data.nonGitLinkedProjects).toHaveLength(0);
    expect(data.gitLinkedProjectsWithMisconfiguredRootDirectory).toHaveLength(
      1
    );
    expect(data.detectedProjects.size).toBe(0);
  });

  it('add-misconfig-dual: two misconfigured rows (add and `vc link --repo`)', () => {
    const data = buildLinkDemoPayload('add-misconfig-dual', demoOrg);
    expect(data.gitLinkedProjects).toHaveLength(0);
    expect(data.nonGitLinkedProjects).toHaveLength(0);
    expect(data.gitLinkedProjectsWithMisconfiguredRootDirectory).toHaveLength(
      2
    );
    expect(data.detectedProjects.size).toBe(0);
  });

  it('add-pair-git-non-git: git-linked + non-git and no detected', () => {
    const data = buildLinkDemoPayload('add-pair-git-non-git', demoOrg);
    expect(data.gitLinkedProjects).toHaveLength(1);
    expect(data.nonGitLinkedProjects).toHaveLength(1);
    expect(data.gitLinkedProjectsWithMisconfiguredRootDirectory).toHaveLength(
      0
    );
    expect(data.detectedProjects.size).toBe(0);
  });

  it('initial-root-one-git: one git-linked row at repo root (`vc link --repo`)', () => {
    const data = buildLinkDemoPayload('initial-root-one-git', demoOrg);
    expect(data.gitLinkedProjects).toHaveLength(1);
    expect(data.gitLinkedProjects[0].directory).toBe('');
    expect(data.gitLinkedProjectsWithMisconfiguredRootDirectory).toHaveLength(
      0
    );
    expect(data.nonGitLinkedProjects).toHaveLength(0);
    expect(data.detectedProjects.size).toBe(0);
  });

  it('initial-scope-apps-web: apps/web only (use from cd apps/web)', () => {
    const data = buildLinkDemoPayload('initial-scope-apps-web', demoOrg);
    expect(data.gitLinkedProjects).toHaveLength(1);
    expect(data.gitLinkedProjects[0].directory).toBe('apps/web');
    expect(data.detectedProjects.has('apps/web')).toBe(true);
    expect(data.nonGitLinkedProjects).toHaveLength(0);
    expect(data.gitLinkedProjectsWithMisconfiguredRootDirectory).toHaveLength(
      0
    );
  });

  it('initial-scope-apps-api: apps/api only (use from cd apps/api)', () => {
    const data = buildLinkDemoPayload('initial-scope-apps-api', demoOrg);
    expect(data.gitLinkedProjects).toHaveLength(1);
    expect(data.gitLinkedProjects[0].directory).toBe('apps/api');
    expect(data.detectedProjects.has('apps/api')).toBe(true);
  });

  it('rejects unknown scenario ids', () => {
    expect(() => buildLinkDemoPayload('no-such-scenario', demoOrg)).toThrow(
      /Unknown LINK_DEMO/
    );
  });
});
