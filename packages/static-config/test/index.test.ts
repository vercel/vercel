import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { getConfig } from '../src';
import { TEST_CASES } from './fixtures/extract-const-value';

const tempDir = mkdtempSync(join(tmpdir(), 'static-config-oxc-'));
let fixtureId = 0;

function getConfigFromSource(source: string) {
  const sourcePath = join(tempDir, `fixture-${fixtureId++}.ts`);
  writeFileSync(sourcePath, source);
  return getConfig(null, sourcePath, {} as const);
}

afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

describe('getConfig()', () => {
  describe('Oxc value extraction compatibility', () => {
    it.each(
      TEST_CASES.filter(testCase => testCase.identifier === 'config')
    )('$input', ({ input, expected }) => {
      expect(getConfigFromSource(input)).toStrictEqual(expected);
    });

    it.each([
      `export const config = { a: 1 + 2 + 3 }`,
      `export const config = { a: foo }`,
    ])('preserves legacy extraction errors: %s', input => {
      expect(() => getConfigFromSource(input)).toThrow(/Unhandled type/);
    });

    it.each([
      {
        input: `export const config = { 123: 'value' }`,
        expected: { 123: 'value' },
      },
      {
        input: `export const config = { ['value']: true }`,
        expected: { "['value']": true },
      },
      {
        input: `export const config = { shorthand }`,
        expected: {},
      },
      {
        input: `export const config = { ...spread }`,
        expected: {},
      },
      {
        input: `export const config = [...spread]`,
        expected: null,
      },
    ])('preserves legacy ts-morph behavior: $input', ({ input, expected }) => {
      expect(getConfigFromSource(input)).toStrictEqual(expected);
    });

    it.each([
      `export const config: { runtime: string } = { runtime: 'edge' }`,
      `export const config = { runtime: 'edge' } as const`,
      `export const config = { runtime: 'edge' } satisfies { runtime: string }`,
    ])('supports TypeScript config syntax: %s', input => {
      expect(getConfigFromSource(input)).toEqual({ runtime: 'edge' });
    });
  });

  it('records Oxc and fallback outcomes on an optional span', () => {
    const attributes: Record<string, string | undefined> = {};
    let stopped = 0;
    const span = {
      child: (_name: string, attrs?: Record<string, string | undefined>) => {
        Object.assign(attributes, attrs);
        return span;
      },
      setAttributes: (attrs: Record<string, string | undefined>) => {
        Object.assign(attributes, attrs);
      },
      stop: () => {
        stopped++;
      },
    };

    const oxcSourcePath = join(tempDir, `fixture-${fixtureId++}.ts`);
    writeFileSync(oxcSourcePath, `export const config = { runtime: 'edge' }`);
    expect(getConfig(null, oxcSourcePath, {} as const, span)).toEqual({
      runtime: 'edge',
    });
    expect(attributes).toMatchObject({
      'static_config.parser': 'oxc',
      'static_config.outcome': 'found',
    });
    expect(attributes).not.toHaveProperty('static_config.fallback');
    expect(stopped).toBe(1);

    const fallbackSourcePath = join(tempDir, `fixture-${fixtureId++}.ts`);
    writeFileSync(fallbackSourcePath, `export const config = { 123: 'value' }`);
    expect(getConfig(null, fallbackSourcePath, {} as const, span)).toEqual({
      123: 'value',
    });
    expect(attributes).toMatchObject({
      'static_config.parser': 'ts-morph',
      'static_config.fallback': 'true',
      'static_config.oxc_error': 'unsupported_node',
      'static_config.outcome': 'found',
    });
    expect(stopped).toBe(2);
  });

  it('should parse config from Node.js file', () => {
    const sourcePath = join(__dirname, 'fixtures/node.js');
    const config = getConfig(null, sourcePath);
    expect(config).toMatchInlineSnapshot(`
      {
        "maxDuration": 60,
        "memory": 1024,
        "runtime": "nodejs",
      }
    `);
  });

  it('should parse config arrays', () => {
    const sourcePath = join(__dirname, 'fixtures/regions.js');
    const config = getConfig(null, sourcePath);
    expect(config?.regions).toEqual(['iad1', 'sfo1']);
  });

  it('should parse config from Deno file', () => {
    const sourcePath = join(__dirname, 'fixtures/deno.ts');
    const config = getConfig(null, sourcePath, {
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

  it('should parse config with maxDuration set to "max"', () => {
    const sourcePath = join(__dirname, 'fixtures/node-max-duration.js');
    const config = getConfig(null, sourcePath);
    expect(config).toMatchInlineSnapshot(`
      {
        "maxDuration": "max",
        "runtime": "nodejs",
      }
    `);
  });

  it('should extract config before a later syntax error', () => {
    const sourcePath = join(
      __dirname,
      'fixtures/config-before-syntax-error.js'
    );
    const config = getConfig(null, sourcePath);
    expect(config?.runtime).toBe('edge');
  });

  it.each([
    'fixtures/syntax-error-before-config.js',
    'fixtures/syntax-error-in-config.js',
  ])('should not recover config across an earlier or internal error: %s', fixture => {
    const config = getConfig(null, join(__dirname, fixture));
    expect(config).toBeNull();
  });

  it('should ignore unrelated syntax errors', () => {
    const sourcePath = join(__dirname, 'fixtures/syntax-error.ts');
    const config = getConfig(null, sourcePath);
    expect(config).toBeNull();
  });

  it('should return `null` when no config was exported', () => {
    const sourcePath = join(__dirname, 'fixtures/no-config.js');
    const config = getConfig(null, sourcePath);
    expect(config).toBeNull();
  });

  it('should throw an error upon schema validation failure', () => {
    const sourcePath = join(__dirname, 'fixtures/invalid-schema.js');
    let err;
    try {
      getConfig(null, sourcePath);
    } catch (_err) {
      err = _err;
    }
    expect(err.message).toEqual('Invalid data');
  });
});
