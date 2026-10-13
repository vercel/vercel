import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { envKey, findPrefixes, resolvePrefix, resourceEnv } from './resolve';

const spec = { factory: 'createS3', service: 'S3', marker: 'S3_BUCKET_NAME' };

describe('envKey', () => {
  test('joins prefix and suffix', () => {
    expect(envKey('STORAGE2', 'AWS_REGION')).toBe('STORAGE2_AWS_REGION');
  });

  test('uses the bare suffix for the unprefixed default', () => {
    expect(envKey('', 'AWS_REGION')).toBe('AWS_REGION');
  });
});

describe('findPrefixes', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = {};
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  test('finds unprefixed and prefixed resources', () => {
    process.env.S3_BUCKET_NAME = 'a';
    process.env.AWS_ROLE_ARN = 'arn:aws:iam::1:role/a';
    process.env.STORAGE2_S3_BUCKET_NAME = 'b';
    process.env.STORAGE2_AWS_ROLE_ARN = 'arn:aws:iam::1:role/b';

    expect(findPrefixes(spec).sort()).toEqual(['', 'STORAGE2']);
  });

  test('ignores markers without a matching role ARN', () => {
    process.env.BACKUP_S3_BUCKET_NAME = 'app-defined';
    process.env.STORAGE_S3_BUCKET_NAME = 'b';
    process.env.STORAGE_AWS_ROLE_ARN = 'arn:aws:iam::1:role/b';

    expect(findPrefixes(spec)).toEqual(['STORAGE']);
  });

  test('ignores empty markers', () => {
    process.env.S3_BUCKET_NAME = '';
    process.env.AWS_ROLE_ARN = 'arn:aws:iam::1:role/a';

    expect(findPrefixes(spec)).toEqual([]);
  });

  test('does not confuse markers that share a suffix', () => {
    process.env.S3_VECTOR_BUCKET_NAME = 'vectors';
    process.env.AWS_ROLE_ARN = 'arn:aws:iam::1:role/v';
    process.env.STORAGE2_S3_TABLE_BUCKET_NAME = 'tables';
    process.env.STORAGE2_AWS_ROLE_ARN = 'arn:aws:iam::1:role/t';

    expect(findPrefixes(spec)).toEqual([]);
  });

  test('handles prefixes that contain the marker text', () => {
    process.env.MY_S3_S3_BUCKET_NAME = 'b';
    process.env.MY_S3_AWS_ROLE_ARN = 'arn:aws:iam::1:role/b';

    expect(findPrefixes(spec)).toEqual(['MY_S3']);
  });

  test('applies accepts()', () => {
    process.env.S3_BUCKET_NAME = 'a';
    process.env.AWS_ROLE_ARN = 'arn:aws:iam::1:role/a';
    process.env.STORAGE2_S3_BUCKET_NAME = 'b';
    process.env.STORAGE2_AWS_ROLE_ARN = 'arn:aws:iam::1:role/b';

    expect(findPrefixes({ ...spec, accepts: p => p !== '' })).toEqual([
      'STORAGE2',
    ]);
  });
});

describe('resolvePrefix', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = {};
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  test('returns the only match', () => {
    process.env.STORAGE3_S3_BUCKET_NAME = 'b';
    process.env.STORAGE3_AWS_ROLE_ARN = 'arn:aws:iam::1:role/b';

    expect(resolvePrefix(spec)).toBe('STORAGE3');
  });

  test('prefers the unprefixed default over prefixed matches', () => {
    process.env.S3_BUCKET_NAME = 'a';
    process.env.AWS_ROLE_ARN = 'arn:aws:iam::1:role/a';
    process.env.STORAGE2_S3_BUCKET_NAME = 'b';
    process.env.STORAGE2_AWS_ROLE_ARN = 'arn:aws:iam::1:role/b';

    expect(resolvePrefix(spec)).toBe('');
  });

  test('throws when nothing matches', () => {
    expect(() => resolvePrefix(spec)).toThrow(
      /createS3: no S3 resource is connected.*S3_BUCKET_NAME/
    );
  });

  test('throws listing every prefix when several match without a default', () => {
    process.env.STORAGE2_S3_BUCKET_NAME = 'b';
    process.env.STORAGE2_AWS_ROLE_ARN = 'arn:aws:iam::1:role/b';
    process.env.STORAGE_S3_BUCKET_NAME = 'a';
    process.env.STORAGE_AWS_ROLE_ARN = 'arn:aws:iam::1:role/a';

    expect(() => resolvePrefix(spec)).toThrow(
      /multiple S3 resources[\s\S]*- STORAGE\n[\s\S]*- STORAGE2/
    );
  });
});

describe('resourceEnv', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = {};
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  test('does not resolve the prefix until a value is required', () => {
    const env = resourceEnv(spec);
    expect(env.optional('AWS_REGION')).toBeUndefined();
    expect(() => env.require('AWS_REGION')).toThrow(/no S3 resource/);
  });

  test('reads under an explicit prefix without scanning', () => {
    process.env.CUSTOM_AWS_REGION = 'us-west-2';

    const env = resourceEnv(spec, 'CUSTOM');
    expect(env.require('AWS_REGION')).toBe('us-west-2');
    expect(env.optional('AWS_REGION')).toBe('us-west-2');
  });

  test('throws naming the missing key', () => {
    expect(() => resourceEnv(spec, 'STORAGE').require('AWS_REGION')).toThrow(
      /missing required environment variable STORAGE_AWS_REGION/
    );
  });

  test('throws when rejects() flags an explicit prefix', () => {
    process.env.STORAGE_S3_BUCKET_NAME = 'b';
    const rejecting = {
      ...spec,
      rejects: (p: string) =>
        p === 'STORAGE' ? 'is the wrong kind' : undefined,
    };

    expect(() => resourceEnv(rejecting, 'STORAGE')).toThrow(
      'createS3: the resource linked under prefix "STORAGE" is the wrong kind.'
    );
    expect(() => resourceEnv(rejecting, 'OTHER')).not.toThrow();
  });

  test('does not run rejects() when autodetecting', () => {
    const rejects = (): string => 'is the wrong kind';
    expect(() => resourceEnv({ ...spec, rejects })).not.toThrow();
  });

  test('throws a provisioning error for placeholder values', () => {
    process.env.STORAGE_AWS_ROLE_ARN = 'provisioning';

    const env = resourceEnv(spec, 'STORAGE');
    expect(() => env.require('AWS_ROLE_ARN')).toThrow(
      /STORAGE_AWS_ROLE_ARN is "provisioning"/
    );
    expect(env.optional('AWS_ROLE_ARN')).toBeUndefined();
  });
});
