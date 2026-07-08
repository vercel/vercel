import { describe, it, expect } from 'vitest';
import {
  parseOutputFormat,
  getOutputFormat,
  isJsonOutput,
  validateJsonOutput,
  resolveOutputFormat,
  OUTPUT_FORMATS,
  ALL_OUTPUT_FORMATS,
} from '../../../src/util/output-format';
import {
  formatOption,
  jsonOption,
  outputFormatOptions,
} from '../../../src/util/arg-common';
import { getFlagsSpecification } from '../../../src/util/get-flags-specification';
import { parseArguments } from '../../../src/util/get-args';

describe('output-format', () => {
  describe('parseOutputFormat', () => {
    it('should return "json" for valid json format', () => {
      expect(parseOutputFormat('json')).toBe('json');
    });

    it('should be case-insensitive', () => {
      expect(parseOutputFormat('JSON')).toBe('json');
      expect(parseOutputFormat('Json')).toBe('json');
      expect(parseOutputFormat('jSoN')).toBe('json');
    });

    it('should return "table" for valid table format', () => {
      expect(parseOutputFormat('table')).toBe('table');
    });

    it('should throw error for invalid format', () => {
      expect(() => parseOutputFormat('xml')).toThrow(
        'Invalid output format: "xml". Valid formats: json, table'
      );
      expect(() => parseOutputFormat('csv')).toThrow(
        'Invalid output format: "csv". Valid formats: json, table'
      );
      expect(() => parseOutputFormat('')).toThrow(
        'Invalid output format: "". Valid formats: json, table'
      );
    });

    it('should validate against a narrowed supported set', () => {
      expect(parseOutputFormat('json', ['json'])).toBe('json');
      expect(() => parseOutputFormat('table', ['json'])).toThrow(
        'Invalid output format: "table". Valid formats: json'
      );
    });
  });

  describe('getOutputFormat', () => {
    it('should return "json" when --format=json is set', () => {
      expect(getOutputFormat({ '--format': 'json' })).toBe('json');
    });

    it('should return "json" when --json flag is set (backward compat)', () => {
      expect(getOutputFormat({ '--json': true })).toBe('json');
    });

    it('should return undefined when no format flag is set', () => {
      expect(getOutputFormat({})).toBeUndefined();
    });

    it('should prefer --format over --json when both are set', () => {
      expect(getOutputFormat({ '--format': 'json', '--json': true })).toBe(
        'json'
      );
    });

    it('should return undefined when --json is false', () => {
      expect(getOutputFormat({ '--json': false })).toBeUndefined();
    });

    it('should handle case-insensitive --format values', () => {
      expect(getOutputFormat({ '--format': 'JSON' })).toBe('json');
      expect(getOutputFormat({ '--format': 'Json' })).toBe('json');
    });

    it('should throw for invalid --format values', () => {
      expect(() => getOutputFormat({ '--format': 'xml' })).toThrow(
        'Invalid output format: "xml"'
      );
    });
  });

  describe('isJsonOutput', () => {
    it('should return true when --format=json', () => {
      expect(isJsonOutput({ '--format': 'json' })).toBe(true);
    });

    it('should return true when --json flag is set', () => {
      expect(isJsonOutput({ '--json': true })).toBe(true);
    });

    it('should return false when no flags are set', () => {
      expect(isJsonOutput({})).toBe(false);
    });

    it('should return false when --json is false', () => {
      expect(isJsonOutput({ '--json': false })).toBe(false);
    });

    it('should return true for case-insensitive json', () => {
      expect(isJsonOutput({ '--format': 'JSON' })).toBe(true);
    });
  });

  describe('validateJsonOutput', () => {
    it('should return valid result with jsonOutput true when --format=json', () => {
      const result = validateJsonOutput({ '--format': 'json' });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.jsonOutput).toBe(true);
      }
    });

    it('should return valid result with jsonOutput true when --json flag is set', () => {
      const result = validateJsonOutput({ '--json': true });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.jsonOutput).toBe(true);
      }
    });

    it('should return valid result with jsonOutput false when no flags are set', () => {
      const result = validateJsonOutput({});
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.jsonOutput).toBe(false);
      }
    });

    it('should return error result for invalid format', () => {
      const result = validateJsonOutput({ '--format': 'xml' });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Invalid output format: "xml"');
      }
    });

    it('should handle case-insensitive json format', () => {
      const result = validateJsonOutput({ '--format': 'JSON' });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.jsonOutput).toBe(true);
      }
    });
  });

  describe('resolveOutputFormat', () => {
    it('resolves --format=json and --json identically', () => {
      const viaFormat = resolveOutputFormat({ '--format': 'json' }, ['json']);
      const viaAlias = resolveOutputFormat({ '--json': true }, ['json']);
      expect(viaFormat).toEqual({ format: 'json' });
      expect(viaAlias).toEqual({ format: 'json' });
    });

    it('returns undefined format when no flag is set', () => {
      expect(resolveOutputFormat({}, ['json', 'table'])).toEqual({
        format: undefined,
      });
    });

    it('allows the same format requested two ways', () => {
      expect(
        resolveOutputFormat({ '--format': 'json', '--json': true }, ['json'])
      ).toEqual({ format: 'json' });
    });

    it('errors when two different formats are requested via aliases', () => {
      const result = resolveOutputFormat({ '--json': true, '--table': true }, [
        'json',
        'table',
      ]);
      expect(result).toHaveProperty('error');
      if ('error' in result) {
        expect(result.error).toContain('Conflicting output formats');
        expect(result.error).toContain('--json');
        expect(result.error).toContain('--table');
      }
    });

    it('errors when --format conflicts with an alias', () => {
      const result = resolveOutputFormat(
        { '--format': 'table', '--json': true },
        ['json', 'table']
      );
      expect(result).toHaveProperty('error');
      if ('error' in result) {
        expect(result.error).toContain('--format=table');
        expect(result.error).toContain('--json');
      }
    });

    it('errors on an unsupported --format value', () => {
      const result = resolveOutputFormat({ '--format': 'yaml' }, [
        'json',
        'table',
      ]);
      expect(result).toHaveProperty('error');
      if ('error' in result) {
        expect(result.error).toContain('Invalid output format: "yaml"');
      }
    });

    it('is case-insensitive for --format', () => {
      expect(resolveOutputFormat({ '--format': 'JSON' }, ['json'])).toEqual({
        format: 'json',
      });
    });
  });

  describe('OUTPUT_FORMATS', () => {
    it('should contain json and table formats', () => {
      expect(OUTPUT_FORMATS).toContain('json');
      expect(OUTPUT_FORMATS).toContain('table');
    });

    it('mirrors ALL_OUTPUT_FORMATS', () => {
      expect(Array.isArray(OUTPUT_FORMATS)).toBe(true);
      expect([...OUTPUT_FORMATS]).toEqual([...ALL_OUTPUT_FORMATS]);
    });
  });

  describe('outputFormatOptions', () => {
    it('generates a --format option plus one boolean alias per format', () => {
      const opts = outputFormatOptions(['json', 'table']);
      const format = opts.find(o => o.name === 'format');
      expect(format).toMatchObject({
        name: 'format',
        shorthand: 'F',
        type: String,
        argument: 'json|table',
        deprecated: false,
      });

      const json = opts.find(o => o.name === 'json');
      const table = opts.find(o => o.name === 'table');
      expect(json).toMatchObject({ type: Boolean, deprecated: false });
      expect(table).toMatchObject({ type: Boolean, deprecated: false });
      expect(json?.description).toBeTruthy();
      expect(table?.description).toBeTruthy();
    });

    it('de-dupes repeated formats', () => {
      const opts = outputFormatOptions(['json', 'json']);
      const jsonAliases = opts.filter(o => o.name === 'json');
      expect(jsonAliases).toHaveLength(1);
      const format = opts.find(o => o.name === 'format');
      expect(format?.argument).toBe('json');
    });

    it('defaults to all supported formats', () => {
      const opts = outputFormatOptions();
      const names = opts.map(o => o.name);
      expect(names).toContain('format');
      for (const format of ALL_OUTPUT_FORMATS) {
        expect(names).toContain(format);
      }
    });
  });

  describe('end-to-end flag parsing', () => {
    it('parses --json and --format for a json-only command', () => {
      const spec = getFlagsSpecification(outputFormatOptions(['json']));

      expect(parseArguments(['--json'], spec).flags['--json']).toBe(true);
      expect(parseArguments(['--format', 'json'], spec).flags['--format']).toBe(
        'json'
      );
      // A format the command didn't declare is not a registered flag.
      expect(() => parseArguments(['--table'], spec)).toThrow();
    });

    it('parses --json and --table for a json+table command', () => {
      const spec = getFlagsSpecification(
        outputFormatOptions(['json', 'table'])
      );

      expect(parseArguments(['--json'], spec).flags['--json']).toBe(true);
      expect(parseArguments(['--table'], spec).flags['--table']).toBe(true);
      expect(parseArguments(['-F', 'table'], spec).flags['--format']).toBe(
        'table'
      );
    });
  });

  describe('formatOption', () => {
    it('should have correct properties', () => {
      expect(formatOption.name).toBe('format');
      expect(formatOption.shorthand).toBe('F');
      expect(formatOption.type).toBe(String);
      expect(formatOption.argument).toBe('FORMAT');
      expect(formatOption.deprecated).toBe(false);
    });
  });

  describe('jsonOption', () => {
    it('should have correct properties and no longer be deprecated', () => {
      expect(jsonOption.name).toBe('json');
      expect(jsonOption.shorthand).toBeNull();
      expect(jsonOption.type).toBe(Boolean);
      expect(jsonOption.deprecated).toBe(false);
      expect(jsonOption.description).not.toContain('DEPRECATED');
    });
  });
});
