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

  it('mixed-all includes git-linked, misconfigured, non-git, and detected rows', () => {
    const data = buildLinkDemoPayload('mixed-all', demoOrg);
    expect(data.gitLinkedProjects.length).toBeGreaterThan(0);
    expect(
      data.gitLinkedProjectsWithMisconfiguredRootDirectory.length
    ).toBeGreaterThan(0);
    expect(data.nonGitLinkedProjects.length).toBeGreaterThan(0);
    expect(data.detectedProjects.size).toBeGreaterThan(0);
  });

  it('one-detect is detected-only with a single root', () => {
    const data = buildLinkDemoPayload('one-detect', demoOrg);
    expect(data.gitLinkedProjects).toHaveLength(0);
    expect(data.gitLinkedProjectsWithMisconfiguredRootDirectory).toHaveLength(
      0
    );
    expect(data.nonGitLinkedProjects).toHaveLength(0);
    expect(data.detectedProjects.size).toBe(1);
  });

  it('multi-detect has no API projects and several detected roots', () => {
    const data = buildLinkDemoPayload('multi-detect', demoOrg);
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

  it('dash-split has no git-linked; non-git Vercel root "" vs suggested apps/web', () => {
    const data = buildLinkDemoPayload('dash-split', demoOrg);
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

  it('solo-non-git is sole non-git with mismatch and no detected rows', () => {
    const data = buildLinkDemoPayload('solo-non-git', demoOrg);
    expect(data.gitLinkedProjects).toHaveLength(0);
    expect(data.gitLinkedProjectsWithMisconfiguredRootDirectory).toHaveLength(
      0
    );
    expect(data.nonGitLinkedProjects).toHaveLength(1);
    expect(data.detectedProjects.size).toBe(0);
    expect(data.nonGitLinkedProjects[0].suggestedDirectory).toBe('apps/web');
  });

  it('solo-misconfig is a single misconfigured row only', () => {
    const data = buildLinkDemoPayload('solo-misconfig', demoOrg);
    expect(data.gitLinkedProjects).toHaveLength(0);
    expect(data.nonGitLinkedProjects).toHaveLength(0);
    expect(data.gitLinkedProjectsWithMisconfiguredRootDirectory).toHaveLength(
      1
    );
    expect(data.detectedProjects.size).toBe(0);
  });

  it('pair-git-nongit has git-linked + non-git and no detected', () => {
    const data = buildLinkDemoPayload('pair-git-nongit', demoOrg);
    expect(data.gitLinkedProjects).toHaveLength(1);
    expect(data.nonGitLinkedProjects).toHaveLength(1);
    expect(data.gitLinkedProjectsWithMisconfiguredRootDirectory).toHaveLength(
      0
    );
    expect(data.detectedProjects.size).toBe(0);
  });

  it('nest-web is apps/web only (use from cd apps/web)', () => {
    const data = buildLinkDemoPayload('nest-web', demoOrg);
    expect(data.gitLinkedProjects).toHaveLength(1);
    expect(data.gitLinkedProjects[0].directory).toBe('apps/web');
    expect(data.detectedProjects.has('apps/web')).toBe(true);
    expect(data.nonGitLinkedProjects).toHaveLength(0);
    expect(data.gitLinkedProjectsWithMisconfiguredRootDirectory).toHaveLength(
      0
    );
  });

  it('nest-api is apps/api only (use from cd apps/api)', () => {
    const data = buildLinkDemoPayload('nest-api', demoOrg);
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
