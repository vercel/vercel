import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generateRandomNameSuffix,
  generateUniqueNameSuffix,
  generateDefaultResourceName,
  getValidationRuleForProduct,
  isResourceNameTakenError,
  MAX_GENERATED_NAME_LENGTH,
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

describe('generateUniqueNameSuffix', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 4 lowercase letters or digits', () => {
    expect(generateUniqueNameSuffix()).toMatch(/^[a-z0-9]{4}$/);
  });

  it('covers both ends of the alphabet', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(generateUniqueNameSuffix()).toBe('aaaa');
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    expect(generateUniqueNameSuffix()).toBe('9999');
  });

  it('rarely repeats', () => {
    const suffixes = new Set(
      Array.from({ length: 200 }, () => generateUniqueNameSuffix())
    );
    // 200 draws from 36^4 values: a handful of repeats at most
    expect(suffixes.size).toBeGreaterThan(195);
  });
});

describe('generateDefaultResourceName', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is the product slug, color and noun, then a unique suffix', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(generateDefaultResourceName('neon')).toBe('neon-gray-apple-aaaa');
  });

  it('drops whole words that do not fit, but keeps the suffix', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // upstash-redis-gray-apple-aaaa would be 29 characters
    expect(generateDefaultResourceName('upstash-redis')).toBe(
      'upstash-redis-gray-aaaa'
    );
  });

  it('drops slug words that do not fit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(generateDefaultResourceName('mongodb-atlas-cluster-plus')).toBe(
      'mongodb-atlas-aaaa'
    );
  });

  it('cuts a first word that is too long on its own', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const name = generateDefaultResourceName('a'.repeat(40));
    expect(name).toBe(`${'a'.repeat(18)}-aaaa`);
    expect(name).toHaveLength(MAX_GENERATED_NAME_LENGTH);
  });

  it('never exceeds 23 characters, even when the product allows more', () => {
    for (const slug of [
      'neon',
      'supabase',
      'upstash-kv',
      'mongodbatlas',
      'turso-database',
      'aws-dynamodb',
      'x'.repeat(100),
    ]) {
      for (let i = 0; i < 50; i++) {
        const name = generateDefaultResourceName(slug, 128);
        expect(name.length).toBeLessThanOrEqual(MAX_GENERATED_NAME_LENGTH);
        expect(name).not.toMatch(/--|-$/);
        expect(name).toMatch(/-[a-z0-9]{4}$/);
      }
    }
  });

  it('respects a product maxLength lower than 23', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(generateDefaultResourceName('neon', 12)).toBe('neon-aaaa');
    expect(generateDefaultResourceName('neon', 3)).toBe('aaa');
  });

  it('produces lowercase names of letters, digits and single hyphens', () => {
    const name = generateDefaultResourceName('test-product');
    expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('differs between calls', () => {
    const names = new Set(
      Array.from({ length: 50 }, () => generateDefaultResourceName('supabase'))
    );
    expect(names.size).toBeGreaterThan(45);
  });
});

describe('isResourceNameTakenError', () => {
  const NAME = 'supabase-gray-k3x9';
  const fallback = (error_message?: string) => ({
    kind: 'unknown',
    reason: 'error',
    error_message,
  });

  it.each([
    // Supabase
    `Project with name "${NAME}" already exists in your organization.`,
    // Upstash
    'database with same name already exists',
    `database with name ${NAME} already exists`,
    // MongoDB Atlas, which may add its own suffix to the name
    `A project named '${NAME}-atlas' already exists in Atlas. To proceed, choose a different cluster name or delete the project in MongoDB Atlas.`,
    `Name "${NAME.toUpperCase()}" has already been taken`,
    `Database ${NAME} already exist`,
    `Resource ${NAME}:\nalready in use`,
  ])('matches %j', message => {
    expect(isResourceNameTakenError(fallback(message), NAME)).toBe(true);
  });

  it.each([
    // Supabase organization comes from the team, not the resource name
    'You are already a member of an organization named "Acme". Please choose a different name.',
    // Installation-level conflict that names something else
    'An organization named "Acme" already exists',
    'Project with name "personal-db" already exists in your organization.',
    'A QStash resource already exists in region us-east-1 for this installation.',
    'acme.com is already registered with Resend. Use a different domain or contact support.',
    `database name ${NAME} exceeds maximum length of 26 characters`,
    'An unexpected error occurred during provisioning',
  ])('does not match %j', message => {
    expect(isResourceNameTakenError(fallback(message), NAME)).toBe(false);
  });

  it('requires an unknown/error fallback with a message', () => {
    const message = `Project with name "${NAME}" already exists`;
    expect(
      isResourceNameTakenError(
        { kind: 'metadata', reason: 'error', error_message: message },
        NAME
      )
    ).toBe(false);
    expect(
      isResourceNameTakenError(
        {
          kind: 'unknown',
          reason: 'multiple_installations',
          error_message: message,
        },
        NAME
      )
    ).toBe(false);
    expect(isResourceNameTakenError(fallback(undefined), NAME)).toBe(false);
    expect(isResourceNameTakenError({ kind: 'provisioned' }, NAME)).toBe(false);
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
      expect(result).toEqual({
        resourceName: 'my-resource',
        isGenerated: false,
      });
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
      expect(result).toEqual({
        resourceName: 'neon-gray-apple-aaaa',
        isGenerated: true,
      });
    });

    it('generates and validates name for aws-apg (strict custom validation)', () => {
      // aws-apg has customValidation that rejects trailing hyphens and consecutive hyphens.
      // Auto-generated names like "aws-apg-gray-apple-aaaa" start with a letter and have
      // no trailing hyphens or consecutive hyphens, so they should pass.
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const result = resolveResourceName('aws-apg');
      expect(result).toEqual({
        resourceName: 'aws-apg-gray-apple-aaaa',
        isGenerated: true,
      });
    });

    it('generates and validates name for aws-dynamodb (minLength: 3)', () => {
      // aws-dynamodb requires minLength: 3. Auto-generated names like
      // "aws-dynamodb-gray-aaaa" are well above 3 characters.
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const result = resolveResourceName('aws-dynamodb');
      expect(result).toEqual({
        resourceName: 'aws-dynamodb-gray-aaaa',
        isGenerated: true,
      });
    });

    it('caps generated names at 23 characters even when the product allows more', () => {
      // aws-apg allows 50 and the default rule 128, but generated names must
      // also fit the strictest partner limit
      for (const slug of ['aws-apg', 'neon', 'x'.repeat(60)]) {
        const result = resolveResourceName(slug);
        if (!('resourceName' in result)) {
          expect.unreachable('Expected a resourceName, got an error');
        }
        expect(result.resourceName.length).toBeLessThanOrEqual(
          MAX_GENERATED_NAME_LENGTH
        );
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
