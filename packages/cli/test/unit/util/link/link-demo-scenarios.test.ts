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

  it('monorepo-1 includes git-linked, misconfigured, non-git, and detected rows', () => {
    const data = buildLinkDemoPayload('monorepo-1', demoOrg);
    expect(data.gitLinkedProjects.length).toBeGreaterThan(0);
    expect(
      data.gitLinkedProjectsWithMisconfiguredRootDirectory.length
    ).toBeGreaterThan(0);
    expect(data.nonGitLinkedProjects.length).toBeGreaterThan(0);
    expect(data.detectedProjects.size).toBeGreaterThan(0);
  });

  it('only-new is detected-only with a single root', () => {
    const data = buildLinkDemoPayload('only-new', demoOrg);
    expect(data.gitLinkedProjects).toHaveLength(0);
    expect(data.gitLinkedProjectsWithMisconfiguredRootDirectory).toHaveLength(
      0
    );
    expect(data.nonGitLinkedProjects).toHaveLength(0);
    expect(data.detectedProjects.size).toBe(1);
  });

  it('detected-multi has no API projects and several detected roots', () => {
    const data = buildLinkDemoPayload('detected-multi', demoOrg);
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

  it('monorepo-2 has no git-linked; non-git Vercel root "" vs suggested apps/web', () => {
    const data = buildLinkDemoPayload('monorepo-2', demoOrg);
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

  it('non-git-only is sole non-git with mismatch and no detected rows', () => {
    const data = buildLinkDemoPayload('non-git-only', demoOrg);
    expect(data.gitLinkedProjects).toHaveLength(0);
    expect(
      data.gitLinkedProjectsWithMisconfiguredRootDirectory
    ).toHaveLength(0);
    expect(data.nonGitLinkedProjects).toHaveLength(1);
    expect(data.detectedProjects.size).toBe(0);
    expect(data.nonGitLinkedProjects[0].suggestedDirectory).toBe('apps/web');
  });

  it('sole-misconfigured is a single misconfigured row only', () => {
    const data = buildLinkDemoPayload('sole-misconfigured', demoOrg);
    expect(data.gitLinkedProjects).toHaveLength(0);
    expect(data.nonGitLinkedProjects).toHaveLength(0);
    expect(
      data.gitLinkedProjectsWithMisconfiguredRootDirectory
    ).toHaveLength(1);
    expect(data.detectedProjects.size).toBe(0);
  });

  it('git-and-non-git has git-linked + non-git and no detected', () => {
    const data = buildLinkDemoPayload('git-and-non-git', demoOrg);
    expect(data.gitLinkedProjects).toHaveLength(1);
    expect(data.nonGitLinkedProjects).toHaveLength(1);
    expect(
      data.gitLinkedProjectsWithMisconfiguredRootDirectory
    ).toHaveLength(0);
    expect(data.detectedProjects.size).toBe(0);
  });

  it('rejects unknown scenario ids', () => {
    expect(() => buildLinkDemoPayload('no-such-scenario', demoOrg)).toThrow(
      /Unknown LINK_DEMO/
    );
  });
});
