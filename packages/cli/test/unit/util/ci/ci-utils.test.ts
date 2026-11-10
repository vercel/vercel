import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { toApiRunId, toDisplayRunId } from '../../../../src/util/ci/ids';
import {
  getRunStatus,
  toBranchName,
  toRunStatusFilter,
} from '../../../../src/util/ci/run-status';
import {
  getCiGitContext,
  resolveCommitSha,
} from '../../../../src/util/ci/git-context';
import { createCiGitRepo, createCiInvocation } from '../../../mocks/ci';

describe('ci run IDs', () => {
  it('hides the internal prefix', () => {
    expect(toDisplayRunId('invo1_abc123')).toBe('abc123');
    expect(toDisplayRunId('abc123')).toBe('abc123');
  });

  it('accepts IDs with or without the prefix', () => {
    expect(toApiRunId('abc123')).toBe('invo1_abc123');
    expect(toApiRunId('invo1_abc123')).toBe('invo1_abc123');
  });

  it.each([
    '',
    '../abc',
    'abc?x=1',
    'abc/def',
    'abc%2F',
    'abc\u0000',
  ])('rejects %j', input => {
    expect(toApiRunId(input)).toBeNull();
  });
});

describe('ci run status', () => {
  it('uses the run conclusion when present', () => {
    expect(
      getRunStatus(createCiInvocation({ runConclusion: { result: 'failed' } }))
    ).toBe('failed');
  });

  it.each([
    ['new', 'queued'],
    ['bootstrapping', 'running'],
    ['awaiting_jobs', 'running'],
    ['bootstrapping_failed', 'failed'],
    ['jobs_on_hive_failed', 'failed'],
    ['skipped', 'skipped'],
  ])('maps %s to %s', (status, expected) => {
    expect(
      getRunStatus(
        createCiInvocation({
          status,
          runConclusion: undefined,
          completed: undefined,
        })
      )
    ).toBe(expected);
  });

  it('maps terminal statuses to conclusion filters', () => {
    expect(toRunStatusFilter('failed')).toEqual({ conclusions: ['failed'] });
    expect(toRunStatusFilter('queued')).toEqual({ statuses: ['new'] });
  });

  it('strips refs/heads/ from branch refs', () => {
    expect(toBranchName('refs/heads/shew/fix')).toBe('shew/fix');
    expect(toBranchName('main')).toBe('main');
  });
});

describe('ci git context', () => {
  it('reads the repository, branch, and HEAD', async () => {
    const { cwd, sha } = createCiGitRepo({ branch: 'shew/fix' });

    await expect(getCiGitContext(cwd)).resolves.toEqual({
      provider: 'github',
      repository: 'vercel/next.js',
      branch: 'shew/fix',
      commitSha: sha,
    });
  });

  it.each([
    'git@github.com:acme/app.git',
    'ssh://git@github.com/acme/app.git',
  ])('parses GitHub SSH remote %s', async remote => {
    const { cwd } = createCiGitRepo({ remote });

    await expect(getCiGitContext(cwd)).resolves.toMatchObject({
      provider: 'github',
      repository: 'acme/app',
    });
  });

  it.each([
    'https://gitlab.com/acme/app.git',
    'git@gitlab.com:acme/app.git',
    'https://gitlab.com/acme/group/app.git',
    'git@gitlab.com:acme/group/app.git',
    'https://bitbucket.org/acme/app.git',
    'git@bitbucket.org:acme/app.git',
  ])('rejects unsupported provider remote %s', async remote => {
    const { cwd } = createCiGitRepo({ remote });

    await expect(getCiGitContext(cwd)).resolves.toBeNull();
  });

  it('reads an explicitly selected remote without changing the origin default', async () => {
    const { cwd } = createCiGitRepo();
    execFileSync(
      'git',
      ['remote', 'add', 'upstream', 'git@github.com:acme/app.git'],
      { cwd }
    );

    await expect(getCiGitContext(cwd, 'upstream')).resolves.toMatchObject({
      repository: 'acme/app',
    });
    await expect(getCiGitContext(cwd)).resolves.toMatchObject({
      repository: 'vercel/next.js',
    });
    await expect(getCiGitContext(cwd, 'missing')).resolves.toBeNull();
  });

  it('omits the branch for a detached HEAD', async () => {
    const { cwd, sha } = createCiGitRepo();
    execFileSync('git', ['checkout', '-q', '--detach'], { cwd });

    const context = await getCiGitContext(cwd);

    expect(context?.branch).toBeUndefined();
    expect(context?.commitSha).toBe(sha);
  });

  it('returns null without a supported origin remote', async () => {
    const noRemote = createCiGitRepo({ remote: '' });
    const unsupported = createCiGitRepo({
      remote: 'https://example.com/acme/app.git',
    });

    await expect(getCiGitContext(noRemote.cwd)).resolves.toBeNull();
    await expect(getCiGitContext(unsupported.cwd)).resolves.toBeNull();
  });

  it('expands short commit SHAs and rejects non-SHA input', async () => {
    const { cwd, sha } = createCiGitRepo();

    await expect(resolveCommitSha(cwd, sha.slice(0, 8))).resolves.toBe(sha);
    await expect(resolveCommitSha(cwd, 'HEAD')).resolves.toBeNull();
    await expect(resolveCommitSha(cwd, '--help')).resolves.toBeNull();
  });
});
