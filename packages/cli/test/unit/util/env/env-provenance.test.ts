import { describe, expect, it } from 'vitest';
import {
  compareEnvProvenance,
  formatEnvProvenance,
  parseEnvProvenance,
} from '../../../../src/util/env/env-provenance';

const CONTENTS_PREFIX = '# Created by Vercel CLI\n';

describe('formatEnvProvenance', () => {
  it('renders target, branch and timestamp', () => {
    const line = formatEnvProvenance({
      target: 'preview',
      gitBranch: 'feature-branch',
      pulledAt: '2026-07-28T00:00:00.000Z',
    });
    expect(line).toBe(
      '# vercel-env: target=preview gitBranch=feature-branch pulledAt=2026-07-28T00%3A00%3A00.000Z\n'
    );
  });

  it('omits absent fields', () => {
    expect(formatEnvProvenance({ target: 'production' })).toBe(
      '# vercel-env: target=production\n'
    );
  });

  it('returns an empty string when there is nothing to record', () => {
    expect(formatEnvProvenance({})).toBe('');
  });

  it('keeps the created-by header byte-identical as the first line', () => {
    // `env pull` detects CLI-authored files with a fixed-length head read of
    // CONTENTS_PREFIX, so provenance must not shift or alter the first line.
    const contents =
      CONTENTS_PREFIX +
      formatEnvProvenance({ target: 'preview' }) +
      'FOO="bar"\n';
    expect(contents.slice(0, CONTENTS_PREFIX.length)).toBe(CONTENTS_PREFIX);
  });
});

describe('parseEnvProvenance', () => {
  it('round-trips a formatted line', () => {
    const provenance = {
      target: 'preview',
      gitBranch: 'feature-branch',
      pulledAt: '2026-07-28T00:00:00.000Z',
    };
    const contents =
      CONTENTS_PREFIX + formatEnvProvenance(provenance) + 'FOO="bar"\n';
    expect(parseEnvProvenance(contents)).toEqual(provenance);
  });

  it('round-trips branches containing spaces and equals signs', () => {
    const gitBranch = 'feat/a b=c';
    const contents =
      CONTENTS_PREFIX + formatEnvProvenance({ target: 'preview', gitBranch });
    expect(parseEnvProvenance(contents)?.gitBranch).toBe(gitBranch);
  });

  it('returns undefined for files pulled before provenance existed', () => {
    expect(parseEnvProvenance(`${CONTENTS_PREFIX}FOO="bar"\n`)).toBeUndefined();
  });

  it('returns undefined for hand-written files', () => {
    expect(parseEnvProvenance('FOO="bar"\n')).toBeUndefined();
  });

  it('does not read a provenance-looking line after the assignments', () => {
    const contents = `${CONTENTS_PREFIX}FOO="bar"\n# vercel-env: target=production\n`;
    expect(parseEnvProvenance(contents)).toBeUndefined();
  });
});

describe('compareEnvProvenance', () => {
  it('reports unknown when there is no provenance', () => {
    expect(compareEnvProvenance(undefined, { target: 'preview' })).toEqual({
      status: 'unknown',
    });
  });

  it('matches when target and branch agree', () => {
    expect(
      compareEnvProvenance(
        { target: 'preview', gitBranch: 'feat' },
        { target: 'preview', gitBranch: 'feat' }
      )
    ).toEqual({ status: 'match' });
  });

  it('matches a plain pull of the same target', () => {
    expect(
      compareEnvProvenance({ target: 'production' }, { target: 'production' })
    ).toEqual({ status: 'match' });
  });

  it('flags a different target', () => {
    const result = compareEnvProvenance(
      { target: 'production' },
      { target: 'preview' }
    );
    expect(result.status).toBe('mismatch');
    expect(result).toHaveProperty('reason', expect.stringContaining('preview'));
  });

  it('flags a branch-specific file when no branch was requested', () => {
    // The reported case: `pull --git-branch` writes `.env.preview.local`, which
    // is otherwise indistinguishable from a plain preview pull.
    const result = compareEnvProvenance(
      { target: 'preview', gitBranch: 'feature-branch' },
      { target: 'preview' }
    );
    expect(result.status).toBe('mismatch');
    expect(result).toHaveProperty(
      'reason',
      expect.stringContaining('feature-branch')
    );
  });

  it('flags a plain file when a branch was requested', () => {
    const result = compareEnvProvenance(
      { target: 'preview' },
      { target: 'preview', gitBranch: 'feature-branch' }
    );
    expect(result.status).toBe('mismatch');
  });

  it('flags a mismatched branch', () => {
    const result = compareEnvProvenance(
      { target: 'preview', gitBranch: 'other' },
      { target: 'preview', gitBranch: 'feature-branch' }
    );
    expect(result.status).toBe('mismatch');
  });

  it('ignores a timestamp-only record', () => {
    expect(
      compareEnvProvenance(
        { pulledAt: '2026-07-28T00:00:00.000Z' },
        { target: 'preview' }
      )
    ).toEqual({ status: 'unknown' });
  });
});
