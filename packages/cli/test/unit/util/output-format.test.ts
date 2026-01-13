import { describe, it, expect } from 'vitest';
import {
  parseOutputFormat,
  getOutputFormat,
  isJsonOutput,
  validateJsonOutput,
  OUTPUT_FORMATS,
} from '../../../src/util/output-format';
import { formatOption, jsonOption } from '../../../src/util/arg-common';

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

    it('should throw error for invalid format', () => {
      expect(() => parseOutputFormat('xml')).toThrow(
        'Invalid output format: "xml". Valid formats: json'
      );
      expect(() => parseOutputFormat('csv')).toThrow(
        'Invalid output format: "csv". Valid formats: json'
      );
      expect(() => parseOutputFormat('')).toThrow(
        'Invalid output format: "". Valid formats: json'
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

  describe('OUTPUT_FORMATS', () => {
    it('should contain json format', () => {
      expect(OUTPUT_FORMATS).toContain('json');
    });

    it('should be a readonly array', () => {
      expect(Array.isArray(OUTPUT_FORMATS)).toBe(true);
      expect(OUTPUT_FORMATS.length).toBe(1);
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
    it('should have correct properties', () => {
      expect(jsonOption.name).toBe('json');
      expect(jsonOption.shorthand).toBeNull();
      expect(jsonOption.type).toBe(Boolean);
      expect(jsonOption.deprecated).toBe(true);
    });
  });
});
