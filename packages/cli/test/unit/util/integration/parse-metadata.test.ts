import { describe, expect, it } from 'vitest';
import {
  parseMetadataFlags,
  validateRequiredMetadata,
} from '../../../../src/util/integration/parse-metadata';
import type { MetadataSchema } from '../../../../src/util/integration/types';

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
    expect(result.errors).toEqual([
      'Invalid metadata format: "region". Expected KEY=VALUE',
    ]);
    expect(result.metadata).toEqual({});
  });

  it('rejects unknown keys', () => {
    const result = parseMetadataFlags(['unknown=value'], basicSchema);
    expect(result.errors).toEqual(['Unknown metadata key: "unknown"']);
    expect(result.metadata).toEqual({});
  });

  it('validates select options (string array)', () => {
    const result = parseMetadataFlags(['region=invalid-region'], basicSchema);
    expect(result.errors).toEqual([
      'Metadata "region" must be one of: us-east-1, us-west-2, eu-central-1',
    ]);
  });

  it('validates select options (object array)', () => {
    const result = parseMetadataFlags(['version=99'], basicSchema);
    expect(result.errors).toEqual([
      'Metadata "version" must be one of: 14, 15, 16',
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
    expect(result.errors).toEqual([
      'Metadata "storage" must be a number, got: "abc"',
    ]);
  });

  it('validates minimum constraint', () => {
    const result = parseMetadataFlags(['storage=0'], basicSchema);
    expect(result.errors).toEqual(['Metadata "storage" must be >= 1']);
  });

  it('validates maximum constraint', () => {
    const result = parseMetadataFlags(['storage=500'], basicSchema);
    expect(result.errors).toEqual(['Metadata "storage" must be <= 256']);
  });

  it('handles empty/undefined input', () => {
    const result = parseMetadataFlags(undefined, basicSchema);
    expect(result.errors).toEqual([]);
    expect(result.metadata).toEqual({});
  });

  it('handles empty array', () => {
    const result = parseMetadataFlags([], basicSchema);
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
    expect(result.errors).toContain('Unknown metadata key: "unknown"');
    expect(result.errors).toContain(
      'Metadata "storage" must be a number, got: "abc"'
    );
    expect(result.errors).toContain(
      'Metadata "region" must be one of: us-east-1, us-west-2, eu-central-1'
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
      expect(result.errors).toEqual([
        'Metadata "auth" must be "true" or "false", got: "yes"',
      ]);
    });

    it('rejects numeric values for boolean', () => {
      const result = parseMetadataFlags(['auth=1'], boolSchema);
      expect(result.errors).toEqual([
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
      expect(result.errors).toEqual([
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
      expect(result.errors).toEqual([
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
      expect(belowMin.errors).toEqual([
        'Metadata "ports" contains number 0 below minimum 1',
      ]);

      const aboveMax = parseMetadataFlags(['ports=80,70000'], schemaWithMinMax);
      expect(aboveMax.errors).toEqual([
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

  it('skips hidden fields', () => {
    // hidden and hiddenOnCreate should be skipped
    const errors = validateRequiredMetadata(
      { region: 'us-east-1' },
      schemaWithRequired
    );
    expect(errors).not.toContain('Required metadata missing: "hidden"');
    expect(errors).not.toContain('Required metadata missing: "hiddenOnCreate"');
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
});
