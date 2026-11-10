import { describe, expect, it } from 'vitest';
import {
  formatIgnoredMetadataKeyWarning,
  isSchemaKey,
  parseMetadataFlags,
  validateRequiredMetadata,
} from '../../../../src/util/integration/parse-metadata';
import { formatMetadataSchemaHelp } from '../../../../src/util/integration/format-schema-help';
import type { MetadataSchema } from '../../../../src/util/integration/types';

const messages = (result: ReturnType<typeof parseMetadataFlags>) =>
  result.errors.map(error => error.message);

describe('parseMetadataFlags', () => {
  const basicSchema: MetadataSchema = {
    type: 'object',
    properties: {
      region: {
        type: 'string',
        'ui:control': 'select',
        'ui:options': ['us-east-1', 'us-west-2', 'eu-central-1'],
      },
      version: {
        type: 'string',
        'ui:control': 'select',
        'ui:options': [
          { value: '14', label: 'PostgreSQL 14' },
          { value: '15', label: 'PostgreSQL 15' },
          { value: '16', label: 'PostgreSQL 16' },
        ],
        default: '16',
      },
      storage: {
        type: 'number',
        'ui:control': 'input',
        minimum: 1,
        maximum: 256,
      },
    },
    required: ['region'],
  };

  it('parses valid KEY=VALUE pairs', () => {
    const result = parseMetadataFlags(['region=us-east-1'], basicSchema);
    expect(result.errors).toEqual([]);
    expect(result.metadata).toEqual({ region: 'us-east-1' });
  });

  it('handles multiple metadata flags', () => {
    const result = parseMetadataFlags(
      ['region=us-east-1', 'version=15'],
      basicSchema
    );
    expect(result.errors).toEqual([]);
    expect(result.metadata).toEqual({ region: 'us-east-1', version: '15' });
  });

  it('rejects invalid format (no equals sign)', () => {
    const result = parseMetadataFlags(['region'], basicSchema);
    expect(messages(result)).toEqual([
      'Invalid metadata format: "region". Expected KEY=VALUE. Valid keys: region, version, storage',
    ]);
    expect(result.metadata).toEqual({});
  });

  it('rejects unknown keys', () => {
    const result = parseMetadataFlags(['unknown=value'], basicSchema);
    expect(messages(result)).toEqual([
      'Unknown metadata key: "unknown". Valid keys: region, version, storage',
    ]);
    expect(result.metadata).toEqual({});
  });

  it('validates select options (string array)', () => {
    const result = parseMetadataFlags(['region=invalid-region'], basicSchema);
    expect(messages(result)).toEqual([
      'Metadata "region" must be one of: us-east-1, us-west-2, eu-central-1, got: "invalid-region"',
    ]);
  });

  it('validates select options (object array)', () => {
    const result = parseMetadataFlags(['version=99'], basicSchema);
    expect(messages(result)).toEqual([
      'Metadata "version" must be one of: 14, 15, 16, got: "99"',
    ]);
  });

  it('coerces number types', () => {
    const result = parseMetadataFlags(['storage=100'], basicSchema);
    expect(result.errors).toEqual([]);
    expect(result.metadata).toEqual({ storage: 100 });
    expect(typeof result.metadata.storage).toBe('number');
  });

  it('validates number must be a number', () => {
    const result = parseMetadataFlags(['storage=abc'], basicSchema);
    expect(messages(result)).toEqual([
      'Metadata "storage" must be a number, got: "abc"',
    ]);
  });

  it('validates minimum constraint', () => {
    const result = parseMetadataFlags(['storage=0'], basicSchema);
    expect(messages(result)).toEqual(['Metadata "storage" must be >= 1']);
  });

  it('validates maximum constraint', () => {
    const result = parseMetadataFlags(['storage=500'], basicSchema);
    expect(messages(result)).toEqual(['Metadata "storage" must be <= 256']);
  });

  it('handles empty/undefined input', () => {
    const result = parseMetadataFlags(undefined, basicSchema);
    expect(result.errors).toEqual([]);
    expect(result.metadata).toEqual({});
  });

  it('handles values with equals signs', () => {
    const schemaWithInput: MetadataSchema = {
      type: 'object',
      properties: {
        connection: {
          type: 'string',
          'ui:control': 'input',
        },
      },
    };
    const result = parseMetadataFlags(
      ['connection=postgres://user:pass=word@host'],
      schemaWithInput
    );
    expect(result.errors).toEqual([]);
    expect(result.metadata).toEqual({
      connection: 'postgres://user:pass=word@host',
    });
  });

  it('collects multiple errors', () => {
    const result = parseMetadataFlags(
      ['unknown=x', 'storage=abc', 'region=invalid'],
      basicSchema
    );
    expect(result.errors).toHaveLength(3);
    expect(messages(result)).toContain(
      'Unknown metadata key: "unknown". Valid keys: region, version, storage'
    );
    expect(messages(result)).toContain(
      'Metadata "storage" must be a number, got: "abc"'
    );
    expect(messages(result)).toContain(
      'Metadata "region" must be one of: us-east-1, us-west-2, eu-central-1, got: "invalid"'
    );
  });

  describe('boolean type', () => {
    const boolSchema: MetadataSchema = {
      type: 'object',
      properties: {
        auth: {
          type: 'boolean',
          'ui:control': 'toggle',
          default: false,
        },
        prodPack: {
          type: 'boolean',
          'ui:control': 'toggle',
          default: false,
        },
      },
    };

    it('coerces "true" to boolean true', () => {
      const result = parseMetadataFlags(['auth=true'], boolSchema);
      expect(result.errors).toEqual([]);
      expect(result.metadata).toEqual({ auth: true });
      expect(typeof result.metadata.auth).toBe('boolean');
    });

    it('coerces "false" to boolean false', () => {
      const result = parseMetadataFlags(['auth=false'], boolSchema);
      expect(result.errors).toEqual([]);
      expect(result.metadata).toEqual({ auth: false });
      expect(typeof result.metadata.auth).toBe('boolean');
    });

    it('rejects non-boolean values', () => {
      const result = parseMetadataFlags(['auth=yes'], boolSchema);
      expect(messages(result)).toEqual([
        'Metadata "auth" must be "true" or "false", got: "yes"',
      ]);
    });

    it('rejects numeric values for boolean', () => {
      const result = parseMetadataFlags(['auth=1'], boolSchema);
      expect(messages(result)).toEqual([
        'Metadata "auth" must be "true" or "false", got: "1"',
      ]);
    });

    it('handles multiple boolean flags', () => {
      const result = parseMetadataFlags(
        ['auth=true', 'prodPack=false'],
        boolSchema
      );
      expect(result.errors).toEqual([]);
      expect(result.metadata).toEqual({ auth: true, prodPack: false });
    });
  });

  describe('array type', () => {
    const arraySchema: MetadataSchema = {
      type: 'object',
      properties: {
        readRegions: {
          type: 'array',
          'ui:control': 'multi-vercel-region',
          items: { type: 'string' },
          'ui:options': ['sfo1', 'iad1', 'fra1', 'dub1'],
        },
        tags: {
          type: 'array',
          'ui:control': 'multi-select',
          items: { type: 'string' },
        },
        computeSize: {
          type: 'array',
          'ui:control': 'slider',
          items: { type: 'number' },
        },
      },
    };

    it('parses comma-separated string array', () => {
      const result = parseMetadataFlags(['readRegions=sfo1,iad1'], arraySchema);
      expect(result.errors).toEqual([]);
      expect(result.metadata).toEqual({ readRegions: ['sfo1', 'iad1'] });
    });

    it('parses single-value string array', () => {
      const result = parseMetadataFlags(['readRegions=sfo1'], arraySchema);
      expect(result.errors).toEqual([]);
      expect(result.metadata).toEqual({ readRegions: ['sfo1'] });
    });

    it('validates each item against ui:options', () => {
      const result = parseMetadataFlags(
        ['readRegions=sfo1,invalid'],
        arraySchema
      );
      expect(messages(result)).toEqual([
        'Metadata "readRegions" contains invalid value: "invalid". Must be one of: sfo1, iad1, fra1, dub1',
      ]);
    });

    it('parses string array without options validation', () => {
      const result = parseMetadataFlags(['tags=web,api,mobile'], arraySchema);
      expect(result.errors).toEqual([]);
      expect(result.metadata).toEqual({ tags: ['web', 'api', 'mobile'] });
    });

    it('parses comma-separated number array', () => {
      const result = parseMetadataFlags(['computeSize=0.25,2'], arraySchema);
      expect(result.errors).toEqual([]);
      expect(result.metadata).toEqual({ computeSize: [0.25, 2] });
      expect(result.metadata.computeSize).toEqual([0.25, 2]);
    });

    it('rejects non-numeric values in number array', () => {
      const result = parseMetadataFlags(['computeSize=0.25,abc'], arraySchema);
      expect(messages(result)).toEqual([
        'Metadata "computeSize" contains invalid number: "abc"',
      ]);
    });

    it('validates min/max constraints on number array items', () => {
      const schemaWithMinMax: MetadataSchema = {
        type: 'object',
        properties: {
          ports: {
            type: 'array',
            'ui:control': 'input',
            items: { type: 'number' },
            minimum: 1,
            maximum: 65535,
          },
        },
      };
      const belowMin = parseMetadataFlags(['ports=0,80'], schemaWithMinMax);
      expect(messages(belowMin)).toEqual([
        'Metadata "ports" contains number 0 below minimum 1',
      ]);

      const aboveMax = parseMetadataFlags(['ports=80,70000'], schemaWithMinMax);
      expect(messages(aboveMax)).toEqual([
        'Metadata "ports" contains number 70000 above maximum 65535',
      ]);

      const valid = parseMetadataFlags(['ports=80,443,8080'], schemaWithMinMax);
      expect(valid.errors).toEqual([]);
      expect(valid.metadata).toEqual({ ports: [80, 443, 8080] });
    });

    it('trims whitespace in comma-separated values', () => {
      const result = parseMetadataFlags(
        ['readRegions=sfo1, iad1, fra1'],
        arraySchema
      );
      expect(result.errors).toEqual([]);
      expect(result.metadata).toEqual({
        readRegions: ['sfo1', 'iad1', 'fra1'],
      });
    });

    it('filters empty strings from trailing commas', () => {
      const result = parseMetadataFlags(['tags=a,'], arraySchema);
      expect(result.errors).toEqual([]);
      expect(result.metadata).toEqual({ tags: ['a'] });
    });

    it('filters empty strings from leading commas', () => {
      const result = parseMetadataFlags(['tags=,a'], arraySchema);
      expect(result.errors).toEqual([]);
      expect(result.metadata).toEqual({ tags: ['a'] });
    });

    it('filters empty strings from multiple consecutive commas', () => {
      const result = parseMetadataFlags(['tags=a,,b'], arraySchema);
      expect(result.errors).toEqual([]);
      expect(result.metadata).toEqual({ tags: ['a', 'b'] });
    });
  });
});

describe('parseMetadataFlags error details', () => {
  const schema: MetadataSchema = {
    type: 'object',
    properties: {
      region: {
        type: 'string',
        'ui:control': 'select',
        'ui:options': ['us-east-1', 'us-west-2', 'eu-central-1'],
      },
      plan: {
        type: 'string',
        'ui:control': 'select',
        'ui:options': [
          { value: 'free', label: 'Free' },
          { value: 'pro', label: 'Pro' },
          { value: 'legacy', label: 'Legacy', hidden: true },
        ],
      },
      readRegions: {
        type: 'array',
        'ui:control': 'multi-select',
        items: { type: 'string' },
        'ui:options': ['sfo1', 'iad1', 'fra1'],
      },
      compute: {
        type: 'string',
        'ui:control': 'input',
        'ui:hidden': true,
      },
      storage: {
        type: 'number',
        'ui:control': 'input',
        minimum: 1,
      },
    },
    required: ['region'],
  };
  const validKeys = 'Valid keys: region, plan, readRegions, storage';

  it('suggests the closest key and lists the valid keys for an unknown key', () => {
    const result = parseMetadataFlags(['regoin=us-east-1'], schema);
    expect(result.errors).toEqual([
      {
        kind: 'unknown_key',
        key: 'regoin',
        message: `Unknown metadata key: "regoin". Did you mean "region"? ${validKeys}`,
      },
    ]);
    expect(result.metadata).toEqual({});
  });

  it('suggests a key that differs only in case', () => {
    const result = parseMetadataFlags(['Region=us-east-1'], schema);
    expect(messages(result)).toEqual([
      `Unknown metadata key: "Region". Did you mean "region"? ${validKeys}`,
    ]);
  });

  it('lists the valid keys without a suggestion when nothing is close', () => {
    const result = parseMetadataFlags(['database=main'], schema);
    expect(messages(result)).toEqual([
      `Unknown metadata key: "database". ${validKeys}`,
    ]);
  });

  it('accepts hidden keys but does not list them', () => {
    const result = parseMetadataFlags(['compute=2'], schema);
    expect(result.errors).toEqual([]);
    expect(result.metadata).toEqual({ compute: '2' });
  });

  it('treats keys inherited from Object.prototype as unknown', () => {
    const result = parseMetadataFlags(['constructor=x', 'toString=y'], schema);
    expect(result.errors.map(error => error.kind)).toEqual([
      'unknown_key',
      'unknown_key',
    ]);
    expect(result.metadata).toEqual({});
  });

  it('says so when the schema has no keys', () => {
    const result = parseMetadataFlags(['region=iad1'], {
      type: 'object',
      properties: {},
    });
    expect(messages(result)).toEqual([
      'Unknown metadata key: "region". This product does not accept metadata.',
    ]);
  });

  it('lists the valid keys for a flag without "="', () => {
    const result = parseMetadataFlags(['region'], schema);
    expect(result.errors).toEqual([
      {
        kind: 'invalid_format',
        key: 'region',
        message: `Invalid metadata format: "region". Expected KEY=VALUE. ${validKeys}`,
      },
    ]);
  });

  it('suggests the closest value for an invalid select value', () => {
    const result = parseMetadataFlags(['region=us-east'], schema);
    expect(result.errors).toEqual([
      {
        kind: 'invalid_value',
        key: 'region',
        message:
          'Metadata "region" must be one of: us-east-1, us-west-2, eu-central-1, got: "us-east". Did you mean "us-east-1"?',
      },
    ]);
    expect(result.metadata).toEqual({});
  });

  it('suggests a value that differs only in case', () => {
    const result = parseMetadataFlags(['region=US-WEST-2'], schema);
    expect(messages(result)).toEqual([
      'Metadata "region" must be one of: us-east-1, us-west-2, eu-central-1, got: "US-WEST-2". Did you mean "us-west-2"?',
    ]);
  });

  it('accepts hidden options but lists and suggests only visible ones', () => {
    expect(parseMetadataFlags(['plan=legacy'], schema)).toEqual({
      metadata: { plan: 'legacy' },
      errors: [],
    });
    expect(messages(parseMetadataFlags(['plan=legacyy'], schema))).toEqual([
      'Metadata "plan" must be one of: free, pro, got: "legacyy"',
    ]);
  });

  it('suggests the closest value for an invalid array item', () => {
    const result = parseMetadataFlags(['readRegions=sfo1,iad'], schema);
    expect(result.errors).toEqual([
      {
        kind: 'invalid_value',
        key: 'readRegions',
        message:
          'Metadata "readRegions" contains invalid value: "iad". Must be one of: sfo1, iad1, fra1. Did you mean "iad1"?',
      },
    ]);
  });

  it('marks type and range failures as invalid values', () => {
    const result = parseMetadataFlags(['storage=abc', 'storage=0'], schema);
    expect(result.errors.map(({ kind, key }) => ({ kind, key }))).toEqual([
      { kind: 'invalid_value', key: 'storage' },
      { kind: 'invalid_value', key: 'storage' },
    ]);
  });

  it('strips control characters from schema values in messages', () => {
    const result = parseMetadataFlags(['tier=x'], {
      type: 'object',
      properties: {
        tier: {
          type: 'string',
          'ui:control': 'select',
          'ui:options': ['basic\u001b[31m', 'pro'],
        },
      },
    });
    expect(messages(result)).toEqual([
      'Metadata "tier" must be one of: basic, pro, got: "x"',
    ]);
  });
});

describe('formatIgnoredMetadataKeyWarning', () => {
  const schema: MetadataSchema = {
    type: 'object',
    properties: {
      region: {
        type: 'string',
        'ui:control': 'vercel-region',
        'ui:options': ['iad1', 'sfo1'],
      },
      name: { type: 'string', 'ui:control': 'input' },
    },
  };

  it('names the ignored key, the closest key and the valid keys', () => {
    const [error] = parseMetadataFlags(['regoin=iad1'], schema).errors;
    expect(formatIgnoredMetadataKeyWarning(error, schema)).toEqual(
      'Ignoring unknown metadata key: "regoin". Did you mean "region"? Valid keys: region, name'
    );
  });

  it('omits the suggestion when nothing is close', () => {
    const [error] = parseMetadataFlags(['plan=pro'], schema).errors;
    expect(formatIgnoredMetadataKeyWarning(error, schema)).toEqual(
      'Ignoring unknown metadata key: "plan". Valid keys: region, name'
    );
  });
});

describe('isSchemaKey', () => {
  const schema: MetadataSchema = {
    type: 'object',
    properties: {
      region: { type: 'string', 'ui:control': 'input' },
    },
  };

  it('is true only for keys the schema defines', () => {
    expect(isSchemaKey(schema, 'region')).toBe(true);
    expect(isSchemaKey(schema, 'regoin')).toBe(false);
    expect(isSchemaKey(schema, 'constructor')).toBe(false);
    expect(isSchemaKey(schema, '__proto__')).toBe(false);
  });
});

describe('validateRequiredMetadata', () => {
  const schemaWithRequired: MetadataSchema = {
    type: 'object',
    properties: {
      region: {
        type: 'string',
        'ui:control': 'select',
      },
      version: {
        type: 'string',
        'ui:control': 'select',
        default: '16',
      },
      hidden: {
        type: 'string',
        'ui:control': 'input',
        'ui:hidden': true,
        default: 'hidden-value',
      },
      hiddenOnCreate: {
        type: 'string',
        'ui:control': 'input',
        'ui:hidden': 'create',
        default: 'create-hidden-value',
      },
    },
    required: ['region', 'version', 'hidden', 'hiddenOnCreate'],
  };

  it('returns error for missing required field', () => {
    const errors = validateRequiredMetadata({}, schemaWithRequired);
    expect(errors).toEqual(['Required metadata missing: "region"']);
  });

  it('skips fields with defaults', () => {
    // version has a default, so it should not error
    const errors = validateRequiredMetadata(
      { region: 'us-east-1' },
      schemaWithRequired
    );
    expect(errors).toEqual([]);
  });

  it('returns empty array when all required fields provided', () => {
    const errors = validateRequiredMetadata(
      { region: 'us-east-1', version: '15' },
      schemaWithRequired
    );
    expect(errors).toEqual([]);
  });

  it('handles schema with no required fields', () => {
    const schemaNoRequired: MetadataSchema = {
      type: 'object',
      properties: {
        optional: { type: 'string', 'ui:control': 'input' },
      },
    };
    const errors = validateRequiredMetadata({}, schemaNoRequired);
    expect(errors).toEqual([]);
  });

  describe('region fields are always skipped', () => {
    const regionSchema: MetadataSchema = {
      type: 'object',
      properties: {
        region: {
          type: 'string',
          'ui:control': 'vercel-region',
          'ui:options': ['iad1', 'sfo1', 'cdg1'],
        },
        readRegions: {
          type: 'array',
          'ui:control': 'multi-vercel-region',
          items: { type: 'string' },
          'ui:options': ['iad1', 'sfo1'],
        },
        name: {
          type: 'string',
          'ui:control': 'input',
        },
      },
      required: ['region', 'readRegions', 'name'],
    };

    it('skips vercel-region and multi-vercel-region fields', () => {
      const errors = validateRequiredMetadata({ name: 'my-db' }, regionSchema);
      expect(errors).toEqual([]);
    });

    it('still errors on non-region required fields', () => {
      const errors = validateRequiredMetadata({}, regionSchema);
      expect(errors).toEqual(['Required metadata missing: "name"']);
    });

    it('does not skip non-region select fields', () => {
      const schema: MetadataSchema = {
        type: 'object',
        properties: {
          plan: {
            type: 'string',
            'ui:control': 'select',
            'ui:options': ['free', 'pro'],
          },
        },
        required: ['plan'],
      };
      const errors = validateRequiredMetadata({}, schema);
      expect(errors).toEqual(['Required metadata missing: "plan"']);
    });
  });
});

describe('formatMetadataSchemaHelp', () => {
  const regionSchema: MetadataSchema = {
    type: 'object',
    properties: {
      region: {
        type: 'string',
        'ui:control': 'vercel-region',
        'ui:options': ['iad1', 'sfo1'],
      },
      name: {
        type: 'string',
        'ui:control': 'input',
      },
    },
    required: ['region', 'name'],
  };

  it('omits (required) for region fields', () => {
    const output = formatMetadataSchemaHelp(regionSchema, 'test-integration');
    // name should show (required) but region should not
    const requiredCount = (output.match(/\(required\)/g) ?? []).length;
    expect(requiredCount).toBe(1);
  });
});
