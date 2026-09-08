import { describe, it, expect } from 'vitest';
import {
  parseOutputFormat,
  getOutputFormat,
  validateJsonOutput,
  shouldPrintVersionBanner,
  wantsMachineReadableOutput,
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

    it('should return "json" when --json flag is set', () => {
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

  describe('wantsMachineReadableOutput / shouldPrintVersionBanner', () => {
    it('treats vercel api as machine-readable (JSON stdout by default)', () => {
      expect(
        wantsMachineReadableOutput('api', ['node', 'vercel', 'api', '/v2/user'])
      ).toBe(true);
      expect(
        shouldPrintVersionBanner('api', ['node', 'vercel', 'api', '/v2/user'])
      ).toBe(false);
    });

    it('keeps human chrome for api --help', () => {
      expect(
        wantsMachineReadableOutput('api', ['node', 'vercel', 'api', '--help'])
      ).toBe(false);
      expect(
        shouldPrintVersionBanner('api', ['node', 'vercel', 'api', '--help'])
      ).toBe(true);
      expect(
        shouldPrintVersionBanner('api', ['node', 'vercel', 'api', '-h'])
      ).toBe(true);
    });

    it('treats --json as machine-readable', () => {
      expect(
        wantsMachineReadableOutput('webhooks', [
          'node',
          'vercel',
          'webhooks',
          'ls',
          '--json',
        ])
      ).toBe(true);
      expect(
        shouldPrintVersionBanner('webhooks', [
          'node',
          'vercel',
          'webhooks',
          'ls',
          '--json',
        ])
      ).toBe(false);
    });

    it('treats --format=json / --format json as machine-readable', () => {
      expect(
        wantsMachineReadableOutput('crons', [
          'node',
          'vercel',
          'crons',
          'ls',
          '--format=json',
        ])
      ).toBe(true);
      expect(
        wantsMachineReadableOutput('crons', [
          'node',
          'vercel',
          'crons',
          'ls',
          '--format=JSON',
        ])
      ).toBe(true);
      expect(
        wantsMachineReadableOutput('crons', [
          'node',
          'vercel',
          'crons',
          'ls',
          '--format',
          'json',
        ])
      ).toBe(true);
      expect(
        shouldPrintVersionBanner('crons', [
          'node',
          'vercel',
          'crons',
          'ls',
          '--format',
          'JSON',
        ])
      ).toBe(false);
    });

    it('keeps human chrome for normal commands', () => {
      expect(wantsMachineReadableOutput('deploy', ['node', 'vercel'])).toBe(
        false
      );
      expect(shouldPrintVersionBanner('deploy', ['node', 'vercel'])).toBe(true);
      expect(
        wantsMachineReadableOutput('list', ['node', 'vercel', 'list'])
      ).toBe(false);
      expect(
        shouldPrintVersionBanner('curl', [
          'node',
          'vercel',
          'curl',
          'https://x',
        ])
      ).toBe(true);
    });
  });

  describe('formatOption', () => {
    it('should have correct properties', () => {
      expect(formatOption.name).toBe('format');
      expect(formatOption.shorthand).toBe('F');
      expect(formatOption.type).toBe(String);
      expect(formatOption.argument).toBe('FORMAT');
      expect(formatOption.deprecated).toBe(false);
      expect(formatOption.description).toBe('Specify the output format (json)');
    });
  });

  describe('jsonOption', () => {
    it('should have correct properties', () => {
      expect(jsonOption.name).toBe('json');
      expect(jsonOption.shorthand).toBeNull();
      expect(jsonOption.type).toBe(Boolean);
      expect(jsonOption.deprecated).toBe(false);
      expect(jsonOption.description).toBe('Output as JSON');
    });
  });
});
