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
