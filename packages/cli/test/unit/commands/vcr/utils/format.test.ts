import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatDigest,
  formatImageReference,
  formatImageStatus,
  formatRelativeTime,
  formatTagReference,
} from '../../../../../src/commands/vcr/utils/format';

describe('formatBytes', () => {
  it('formats a byte count as a human-readable size', () => {
    expect(formatBytes(2097152)).toBe('2MB');
  });

  it('returns a dash for null or undefined', () => {
    expect(formatBytes(null)).toBe('-');
    expect(formatBytes(undefined)).toBe('-');
  });

  it('returns a dash for NaN', () => {
    expect(formatBytes(Number.NaN)).toBe('-');
  });
});

describe('formatRelativeTime', () => {
  it('formats a past ISO timestamp as time-ago', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(oneHourAgo)).toBe('1h ago');
  });

  it('returns a dash for an invalid date string', () => {
    expect(formatRelativeTime('not-a-date')).toBe('-');
  });
});

describe('formatDigest', () => {
  it('strips the sha256 prefix and truncates to 12 characters', () => {
    expect(
      formatDigest(
        'sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd'
      )
    ).toBe('1234567890ab');
  });

  it('returns a dash for null, undefined, or empty digest', () => {
    expect(formatDigest(null)).toBe('-');
    expect(formatDigest(undefined)).toBe('-');
    expect(formatDigest('')).toBe('-');
  });
});

describe('formatImageStatus', () => {
  it('maps known statuses to human-readable labels', () => {
    expect(formatImageStatus('ready')).toBe('Ready');
    expect(formatImageStatus('preparing')).toBe('Preparing');
    expect(formatImageStatus('unoptimized')).toBe('Ready (unoptimized)');
  });

  it('returns a dash for null', () => {
    expect(formatImageStatus(null)).toBe('-');
  });
});

describe('formatImageReference', () => {
  it('builds a fully-qualified pull string', () => {
    expect(
      formatImageReference('my-team', 'vcr-project', 'my-app', 'sha256:abc')
    ).toBe('vcr.vercel.com/my-team/vcr-project/my-app@sha256:abc');
  });

  it('returns a dash when the digest is missing', () => {
    expect(
      formatImageReference('my-team', 'vcr-project', 'my-app', undefined)
    ).toBe('-');
    expect(formatImageReference('my-team', 'vcr-project', 'my-app', null)).toBe(
      '-'
    );
  });
});

describe('formatTagReference', () => {
  it('builds a tag-qualified pull string', () => {
    expect(
      formatTagReference('my-team', 'vcr-project', 'my-app', 'latest')
    ).toBe('vcr.vercel.com/my-team/vcr-project/my-app:latest');
  });

  it('returns a dash when the tag is missing', () => {
    expect(
      formatTagReference('my-team', 'vcr-project', 'my-app', undefined)
    ).toBe('-');
    expect(formatTagReference('my-team', 'vcr-project', 'my-app', null)).toBe(
      '-'
    );
  });
});
