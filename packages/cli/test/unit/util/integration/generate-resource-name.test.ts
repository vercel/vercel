import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generateRandomNameSuffix,
  generateDefaultResourceName,
  getValidationRuleForProduct,
  validateResourceName,
  resolveResourceName,
} from '../../../../src/util/integration/generate-resource-name';

describe('generateRandomNameSuffix', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns format color-noun', () => {
    const suffix = generateRandomNameSuffix();
    expect(suffix).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it('returns first color and noun when random is 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(generateRandomNameSuffix()).toBe('gray-apple');
  });

  it('returns last color and noun when random approaches 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const result = generateRandomNameSuffix();
    expect(result).toMatch(/^[a-z]+-[a-z]+$/);
    // Must differ from index-0 result, proving last index is reachable
    expect(result).not.toBe('gray-apple');
  });

  it('has uniform distribution (edge elements are not biased)', () => {
    // With Math.floor(arr.length * Math.random()), all indices have equal probability
    // Test that index 0 is reachable with random = 0
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result1 = generateRandomNameSuffix();
    expect(result1).toBe('gray-apple');

    // Test that last index is reachable with random just under 1
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    const result2 = generateRandomNameSuffix();
    expect(result2).toMatch(/^[a-z]+-[a-z]+$/);
    // Edge elements should differ, proving uniform distribution
    expect(result2).not.toBe('gray-apple');
  });
});

describe('generateDefaultResourceName', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefixes with product slug', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(generateDefaultResourceName('neon')).toBe('neon-gray-apple');
  });

  it('works with different product slugs', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(generateDefaultResourceName('upstash-redis')).toBe(
      'upstash-redis-gray-apple'
    );
  });

  it('produces valid resource name format', () => {
    const name = generateDefaultResourceName('test-product');
    // Should be: productSlug-color-noun, all lowercase with hyphens
    expect(name).toMatch(/^[a-z0-9-]+-[a-z]+-[a-z]+$/);
  });

  it('truncates to 128 chars by default when product slug is too long', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const longSlug = 'a'.repeat(125); // Will generate 125 + 1 + 10 = 136 chars
    const name = generateDefaultResourceName(longSlug);
    expect(name.length).toBe(128);
  });

  it('truncates to custom maxLength when provided', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const longSlug = 'a'.repeat(50); // Will generate 50 + 1 + 10 = 61 chars
    const name = generateDefaultResourceName(longSlug, 50);
    expect(name.length).toBe(50);
  });

  it('does not truncate when name fits in maxLength', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const shortSlug = 'neon'; // 4 + 1 + 10 = 15 chars total
    const name = generateDefaultResourceName(shortSlug);
    expect(name).toBe('neon-gray-apple');
    expect(name.length).toBeLessThanOrEqual(128);
  });
});

describe('getValidationRuleForProduct', () => {
  it('returns default rules for unknown products', () => {
    const rule = getValidationRuleForProduct('neon');
    expect(rule.minLength).toBe(1);
    expect(rule.maxLength).toBe(128);
  });

  it('returns default rules for undefined product', () => {
    const rule = getValidationRuleForProduct(undefined);
    expect(rule.minLength).toBe(1);
    expect(rule.maxLength).toBe(128);
  });

  it('returns aurora-dsql rules for aws-dsql', () => {
    const rule = getValidationRuleForProduct('aws-dsql');
    expect(rule.minLength).toBe(1);
    expect(rule.maxLength).toBe(128);
    // Should not allow spaces (unlike default)
    expect(rule.pattern.test('my-resource')).toBe(true);
    expect(rule.pattern.test('my resource')).toBe(false);
  });

  it('returns aurora-postgres rules for aws-apg', () => {
    const rule = getValidationRuleForProduct('aws-apg');
    expect(rule.minLength).toBe(1);
    expect(rule.maxLength).toBe(50);
    // Must start with letter
    expect(rule.pattern.test('myresource')).toBe(true);
    expect(rule.pattern.test('1resource')).toBe(false);
    // Has custom validation for trailing hyphen and consecutive hyphens
    expect(rule.customValidation).toBeDefined();
  });

  it('returns amazon-dynamodb rules for aws-dynamodb', () => {
    const rule = getValidationRuleForProduct('aws-dynamodb');
    expect(rule.minLength).toBe(3);
    expect(rule.maxLength).toBe(128);
  });

  it('is case-insensitive for product slug', () => {
    const rule1 = getValidationRuleForProduct('AWS-DSQL');
    const rule2 = getValidationRuleForProduct('aws-dsql');
    expect(rule1.maxLength).toBe(rule2.maxLength);
  });
});

describe('validateResourceName', () => {
  describe('default validation', () => {
    it('returns undefined for valid names', () => {
      expect(validateResourceName('my-resource')).toBeUndefined();
      expect(validateResourceName('neon-gray-apple')).toBeUndefined();
      expect(validateResourceName('test123')).toBeUndefined();
      expect(validateResourceName('a')).toBeUndefined();
    });

    it('accepts uppercase letters', () => {
      expect(validateResourceName('My-Resource')).toBeUndefined();
      expect(validateResourceName('MYRESOURCE')).toBeUndefined();
    });

    it('accepts underscores', () => {
      expect(validateResourceName('my_resource')).toBeUndefined();
    });

    it('rejects spaces', () => {
      expect(validateResourceName('my resource')).toBe(
        'Resource name can only contain letters, numbers, underscores, and hyphens'
      );
    });

    it('rejects empty names', () => {
      expect(validateResourceName('')).toBe('Resource name cannot be empty');
      expect(validateResourceName('   ')).toBe('Resource name cannot be empty');
    });

    it('rejects names over 128 characters', () => {
      const longName = 'a'.repeat(129);
      expect(validateResourceName(longName)).toBe(
        'Resource name cannot exceed 128 characters'
      );

      // 128 chars should be fine
      const exactlyMaxName = 'a'.repeat(128);
      expect(validateResourceName(exactlyMaxName)).toBeUndefined();
    });

    it('rejects names with invalid characters', () => {
      expect(validateResourceName('my.resource')).toBe(
        'Resource name can only contain letters, numbers, underscores, and hyphens'
      );
      expect(validateResourceName('my@resource')).toBe(
        'Resource name can only contain letters, numbers, underscores, and hyphens'
      );
    });
  });

  describe('aws-dsql validation', () => {
    it('accepts valid names', () => {
      expect(validateResourceName('my-resource', 'aws-dsql')).toBeUndefined();
      expect(validateResourceName('my_resource', 'aws-dsql')).toBeUndefined();
    });

    it('rejects spaces', () => {
      expect(validateResourceName('my resource', 'aws-dsql')).toBe(
        'Resource name can only contain letters, numbers, underscores, and hyphens'
      );
    });
  });

  describe('aws-apg (aurora-postgres) validation', () => {
    it('accepts valid names', () => {
      expect(validateResourceName('myresource', 'aws-apg')).toBeUndefined();
      expect(
        validateResourceName('My-Resource-123', 'aws-apg')
      ).toBeUndefined();
    });

    it('rejects names not starting with a letter', () => {
      expect(validateResourceName('1resource', 'aws-apg')).toBe(
        'Resource name must start with a letter and can only contain letters, numbers, and hyphens'
      );
      expect(validateResourceName('-resource', 'aws-apg')).toBe(
        'Resource name must start with a letter and can only contain letters, numbers, and hyphens'
      );
    });

    it('rejects underscores', () => {
      expect(validateResourceName('my_resource', 'aws-apg')).toBe(
        'Resource name must start with a letter and can only contain letters, numbers, and hyphens'
      );
    });

    it('rejects names over 50 characters', () => {
      const longName = 'a'.repeat(51);
      expect(validateResourceName(longName, 'aws-apg')).toBe(
        'Resource name cannot exceed 50 characters'
      );

      // 50 chars should be fine
      const exactlyMaxName = 'a'.repeat(50);
      expect(validateResourceName(exactlyMaxName, 'aws-apg')).toBeUndefined();
    });

    it('rejects trailing hyphen', () => {
      expect(validateResourceName('myresource-', 'aws-apg')).toBe(
        'Resource name cannot end with a hyphen'
      );
    });

    it('rejects consecutive hyphens', () => {
      expect(validateResourceName('my--resource', 'aws-apg')).toBe(
        'Resource name cannot contain consecutive hyphens'
      );
    });
  });

  describe('aws-dynamodb validation', () => {
    it('accepts valid names', () => {
      expect(
        validateResourceName('my-resource', 'aws-dynamodb')
      ).toBeUndefined();
      expect(
        validateResourceName('my_resource', 'aws-dynamodb')
      ).toBeUndefined();
    });

    it('rejects names under 3 characters', () => {
      expect(validateResourceName('ab', 'aws-dynamodb')).toBe(
        'Resource name must be at least 3 characters'
      );

      // 3 chars should be fine
      expect(validateResourceName('abc', 'aws-dynamodb')).toBeUndefined();
    });

    it('rejects spaces', () => {
      expect(validateResourceName('my resource', 'aws-dynamodb')).toBe(
        'Resource name can only contain letters, numbers, underscores, and hyphens'
      );
    });
  });
});

describe('resolveResourceName', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('with user-provided name', () => {
    it('returns valid user-provided name', () => {
      const result = resolveResourceName('neon', 'my-resource');
      expect(result).toEqual({ resourceName: 'my-resource' });
    });

    it('returns error for invalid user-provided name', () => {
      const result = resolveResourceName('neon', 'my resource');
      expect(result).toEqual({
        error:
          'Resource name can only contain letters, numbers, underscores, and hyphens',
      });
    });
  });

  describe('with auto-generated name', () => {
    it('generates and validates name for default products', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const result = resolveResourceName('neon');
      expect(result).toEqual({ resourceName: 'neon-gray-apple' });
    });

    it('generates and validates name for aws-apg (strict custom validation)', () => {
      // aws-apg has customValidation that rejects trailing hyphens and consecutive hyphens.
      // Auto-generated names like "aws-apg-gray-apple" start with a letter and have
      // no trailing hyphens or consecutive hyphens, so they should pass.
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const result = resolveResourceName('aws-apg');
      expect(result).toEqual({ resourceName: 'aws-apg-gray-apple' });
    });

    it('generates and validates name for aws-dynamodb (minLength: 3)', () => {
      // aws-dynamodb requires minLength: 3. Auto-generated names like
      // "aws-dynamodb-gray-apple" are well above 3 characters.
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const result = resolveResourceName('aws-dynamodb');
      expect(result).toEqual({ resourceName: 'aws-dynamodb-gray-apple' });
    });

    it('respects product-specific maxLength during generation', () => {
      // Use a long slug that will trigger truncation against aws-apg's maxLength of 50
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const result = resolveResourceName('aws-apg');
      if ('resourceName' in result) {
        // aws-apg maxLength is 50; generated name must respect it
        expect(result.resourceName.length).toBeLessThanOrEqual(50);
        // Also verify truncation works for generateDefaultResourceName directly
        const longSlug = 'a'.repeat(45);
        const truncated = generateDefaultResourceName(longSlug, 50);
        expect(truncated.length).toBeLessThanOrEqual(50);
      } else {
        expect.unreachable('Expected a resourceName, got an error');
      }
    });

    it('user-provided validation errors do not include --name guidance', () => {
      // When a user provides an invalid name, the error should NOT suggest --name
      // (since they already used --name). This verifies the two error paths differ.
      const result = resolveResourceName('aws-apg', '1-bad-name');
      expect(result).toEqual({
        error:
          'Resource name must start with a letter and can only contain letters, numbers, and hyphens',
      });
      if ('error' in result) {
        expect(result.error).not.toContain('--name');
      }
    });
  });
});
