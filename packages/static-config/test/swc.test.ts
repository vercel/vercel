import * as fs from 'fs';
import * as path from 'path';
import * as swc from '@swc/core';
import {
  extractExportedConstValue,
  getConfig,
  UnsupportedValueError,
} from '../src/swc';
import {
  NO_SUCH_DECLARATION_CASES,
  TEST_CASES,
  UNSUPPORTED_VALUE_CASES,
} from './fixtures/extract-const-value';
import { BaseFunctionConfigSchema } from '../src';

function parse(source: string): swc.Module {
  return swc.parseSync(source, { syntax: 'typescript' });
}

function parseFixture(filename: string): swc.Module {
  const sourcePath = path.join(__dirname, filename);
  const input = fs.readFileSync(sourcePath, { encoding: 'utf-8' });
  return parse(input);
}

describe('extractExportedConstValue for swc', () => {
  describe('parses successfully', () => {
    test.each(TEST_CASES)('$input', ({ input, identifier, expected }) => {
      const ast = parse(input);
      const value = extractExportedConstValue(ast, identifier);
      expect(value).toStrictEqual(expected);
    });
  });

  describe('fails with UnsupportedValueError', () => {
    test.each(UNSUPPORTED_VALUE_CASES)('$input', ({ input, identifier }) => {
      const ast = parse(input);
      expect(() => {
        extractExportedConstValue(ast, identifier);
      }).toThrow(UnsupportedValueError);
    });
  });

  describe('returns null if the declaration is not found', () => {
    test.each(NO_SUCH_DECLARATION_CASES)('$input', ({ input, identifier }) => {
      const ast = parse(input);
      const value = extractExportedConstValue(ast, identifier);
      expect(value).toBe(null);
    });
  });
});

describe('getConfig for swc', () => {
  it('should parse config from Node.js file', () => {
    const ast = parseFixture('fixtures/node.js');
    const config = getConfig(ast, BaseFunctionConfigSchema);
    expect(config).toMatchInlineSnapshot(`
      {
        "maxDuration": 60,
        "memory": 1024,
        "regions": [
          "fra1",
        ],
        "runtime": "nodejs",
      }
    `);
  });

  it('should parse config from Deno file', () => {
    const ast = parseFixture('fixtures/deno.ts');
    const config = getConfig(ast, {
      type: 'object',
      properties: {
        location: { type: 'string' },
      },
    } as const);
    expect(config).toMatchInlineSnapshot(`
      {
        "location": "https://example.com/page",
        "maxDuration": 60,
        "runtime": "deno",
      }
    `);
  });

  it('should return `null` when no config was exported', () => {
    const ast = parseFixture('fixtures/no-config.js');
    const config = getConfig(ast, BaseFunctionConfigSchema);
    expect(config).toBeNull();
  });

  it('should throw an error upon schema validation failure', () => {
    const ast = parseFixture('fixtures/invalid-schema.js');
    let err;
    try {
      getConfig(ast, BaseFunctionConfigSchema);
    } catch (_err) {
      err = _err;
    }
    expect(err.message).toEqual('Invalid data');
  });
});
