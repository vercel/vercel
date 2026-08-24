import { describe, expect, it } from 'vitest';
import {
  REDACTED,
  ctxHash,
  fp,
  gatedFlag,
  gatedToken,
  slug,
} from '../../../src/util/telemetry/sanitize';

describe('gatedToken', () => {
  it.each([
    ['deploy', 'deploy'],
    ['DEPLOY', 'deploy'],
    ['agent-runs', 'agent-runs'],
    ['env:pull', 'env:pull'],
    ['a'.repeat(32), 'a'.repeat(32)],
  ])('passes command-like token %s', (input, expected) => {
    expect(gatedToken(input)).toBe(expected);
  });

  it.each([
    [''],
    ['a'.repeat(33)],
    ['./my-app'],
    ['path/to/dir'],
    ['file.txt'],
    ['--flag'],
    ['sk_live_abc123XYZ'],
    ['has space'],
    ['dpl_FpMqyL7Rah6o1BDG'],
  ])('redacts %s', input => {
    expect(gatedToken(input)).toBe(REDACTED);
  });
});

describe('gatedFlag', () => {
  it.each([['--prod'], ['--no-wait'], ['--f']])('passes %s', input => {
    expect(gatedFlag(input)).toBe(input);
  });

  it.each([
    ['-p'],
    ['--Prod'],
    ['--' + 'a'.repeat(25)],
    ['--flag=value'],
    ['prod'],
    [''],
  ])('redacts %s', input => {
    expect(gatedFlag(input)).toBe(REDACTED);
  });
});

describe('slug', () => {
  it('strips err.sh prefix', () => {
    expect(slug('https://err.sh/vercel/no-credentials-found')).toBe(
      'vercel/no-credentials-found'
    );
  });

  it('strips vercel.com docs prefix', () => {
    expect(slug('https://vercel.com/docs/cli/deploy')).toBe('cli/deploy');
  });

  it('passes bare slugs', () => {
    expect(slug('rate_limited')).toBe('rate_limited');
    expect(slug('rate-limited')).toBe('rate-limited');
  });

  it('redacts arbitrary urls', () => {
    expect(slug('https://example.com/anything')).toBe(REDACTED);
    expect(slug('https://err.sh/../../etc/passwd?q=1')).toBe(REDACTED);
  });
});

describe('fp', () => {
  it('is stable for the same salt and irreversible-looking', () => {
    const a = fp(['deploy', '--prod'], 'device-1');
    expect(a).toBe(fp(['deploy', '--prod'], 'device-1'));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain('deploy');
  });

  it('differs across salts and inputs', () => {
    expect(fp(['deploy'], 'device-1')).not.toBe(fp(['deploy'], 'device-2'));
    expect(fp(['deploy'], 'device-1')).not.toBe(fp(['dev'], 'device-1'));
  });

  it('does not collapse argument boundaries', () => {
    expect(fp(['ab', 'c'], 's')).not.toBe(fp(['a', 'bc'], 's'));
  });
});

describe('ctxHash', () => {
  it('is stable and short', () => {
    const h = ctxHash([1234, 1700000000, '/repo'], 'device-1');
    expect(h).toBe(ctxHash([1234, 1700000000, '/repo'], 'device-1'));
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});
