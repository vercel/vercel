import assert from 'assert';
import { validateFrameworkVersion } from '../src';
import { describe, it } from 'vitest';

describe('validateFrameworkVersion', () => {
  it('returns undefined if empty', () => {
    const framework = validateFrameworkVersion(undefined);
    assert.strictEqual(framework, undefined);
  });

  it('returns undefined if missing slug', () => {
    // @ts-expect-error - deliberately testing invalid value
    const frameworkRaw: { slug: string; version: string } = {};
    const framework = validateFrameworkVersion(frameworkRaw);
    assert.strictEqual(framework, undefined);
  });

  it('returns undefined if missing version', () => {
    // @ts-expect-error - deliberately testing invalid value
    const frameworkRaw: { slug: string; version: string } = {
      slug: 'foo',
    };
    const framework = validateFrameworkVersion(frameworkRaw);
    assert.strictEqual(framework, undefined);
  });

  it('throws error if "slug" is not a string', () => {
    const frameworkVersionRaw: { slug: string; version: string } = {
      slug: 123 as any,
      version: '1.0.0',
    };
    assert.throws(() => {
      validateFrameworkVersion(frameworkVersionRaw);
    }, /Invalid config.json: "framework.slug" type/);
  });

  it('throws if "slug" is too long', () => {
    const frameworkVersionRaw = {
      // too long
      slug: 'foofoofoofoofoofoofoofoofoofoofoofoofoofoofoofoofoofoofoofoo',
      version: '123',
    };

    assert.throws(() => {
      validateFrameworkVersion(frameworkVersionRaw);
    }, /Invalid config.json: "framework.slug" length/);
  });

  it('throws error if "version" is not a string', () => {
    const frameworkVersionRaw: { slug: string; version: string } = {
      slug: 'foo',
      version: 123 as any,
    };
    assert.throws(() => {
      validateFrameworkVersion(frameworkVersionRaw);
    }, /Invalid config.json: "framework.version" type/);
  });

  it('throws if "version" is too long', () => {
    const frameworkVersionRaw = {
      slug: 'foo',
      // too long
      version: '123456789 123456789 123456789 123456789 123456789 123',
    };

    assert.throws(() => {
      validateFrameworkVersion(frameworkVersionRaw);
    }, /Invalid config.json: "framework.version" length/);
  });

  it('returns populated "framework"', () => {
    const frameworkVersionRaw = {
      slug: 'foo',
      version: '123',
    };
    const framework = validateFrameworkVersion(frameworkVersionRaw);
    assert.strictEqual(framework, frameworkVersionRaw);
  });
});
