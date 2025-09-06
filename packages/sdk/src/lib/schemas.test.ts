import { collectExtraKeys } from './schemas';
import { ZodObject, ZodString, ZodNumber } from 'zod';

describe('collectExtraKeys - Prototype Pollution Protection', () => {
  const testSchema = new ZodObject({
    shape: {
      knownField: new ZodString(),
    },
    unknownKeys: 'strip' as const,
    catchall: new ZodString(),
  });

  test('should process safe extra keys normally', () => {
    const processor = collectExtraKeys(testSchema, 'extras');
    
    const input = {
      knownField: 'known value',
      safeExtra1: 'value1',
      safeExtra2: 'value2',
    };

    const result = processor.parse(input);

    expect(result).toEqual({
      knownField: 'known value',
      extras: {
        safeExtra1: 'value1',
        safeExtra2: 'value2',
      },
    });
  });

  test('should filter out __proto__ to prevent prototype pollution', () => {
    const processor = collectExtraKeys(testSchema, 'extras');
    
    const input = {
      knownField: 'known value',
      safeExtra: 'safe value',
      __proto__: { polluted: true },
    };

    const result = processor.parse(input);

    expect(result).toEqual({
      knownField: 'known value',
      extras: {
        safeExtra: 'safe value',
      },
    });

    // Verify __proto__ was not added to extras
    expect(result.extras).not.toHaveProperty('__proto__');
  });

  test('should filter out constructor to prevent prototype pollution', () => {
    const processor = collectExtraKeys(testSchema, 'extras');
    
    const input = {
      knownField: 'known value',
      safeExtra: 'safe value',
      constructor: { prototype: { polluted: true } },
    };

    const result = processor.parse(input);

    expect(result).toEqual({
      knownField: 'known value',
      extras: {
        safeExtra: 'safe value',
      },
    });

    // Verify constructor was not added to extras
    expect(result.extras).not.toHaveProperty('constructor');
  });

  test('should filter out prototype to prevent prototype pollution', () => {
    const processor = collectExtraKeys(testSchema, 'extras');
    
    const input = {
      knownField: 'known value',
      safeExtra: 'safe value',
      prototype: { polluted: true },
    };

    const result = processor.parse(input);

    expect(result).toEqual({
      knownField: 'known value',
      extras: {
        safeExtra: 'safe value',
      },
    });

    // Verify prototype was not added to extras
    expect(result.extras).not.toHaveProperty('prototype');
  });

  test('should filter multiple dangerous keys simultaneously', () => {
    const processor = collectExtraKeys(testSchema, 'extras');
    
    const input = {
      knownField: 'known value',
      safeExtra: 'safe value',
      __proto__: { polluted1: true },
      constructor: { prototype: { polluted2: true } },
      prototype: { polluted3: true },
    };

    const result = processor.parse(input);

    expect(result).toEqual({
      knownField: 'known value',
      extras: {
        safeExtra: 'safe value',
      },
    });

    // Verify none of the dangerous keys were added to extras
    expect(result.extras).not.toHaveProperty('__proto__');
    expect(result.extras).not.toHaveProperty('constructor');
    expect(result.extras).not.toHaveProperty('prototype');
  });

  test('should not pollute Object.prototype', () => {
    const processor = collectExtraKeys(testSchema, 'extras');
    
    const input = {
      knownField: 'known value',
      __proto__: { polluted: true },
      constructor: { prototype: { polluted: true } },
      prototype: { polluted: true },
    };

    // Store original prototype state
    const originalPrototype = Object.prototype;
    const originalConstructor = originalPrototype.constructor;

    processor.parse(input);

    // Verify Object.prototype is not polluted
    expect(Object.prototype).toBe(originalPrototype);
    expect(Object.prototype.constructor).toBe(originalConstructor);
    expect((Object.prototype as any).polluted).toBeUndefined();
  });

  test('should handle undefined values correctly', () => {
    const processor = collectExtraKeys(testSchema, 'extras');
    
    const input = {
      knownField: 'known value',
      undefinedExtra: undefined,
      safeExtra: 'safe value',
      __proto__: undefined,
    };

    const result = processor.parse(input);

    expect(result).toEqual({
      knownField: 'known value',
      extras: {
        safeExtra: 'safe value',
      },
    });

    // Verify undefined values are not included in extras
    expect(result.extras).not.toHaveProperty('undefinedExtra');
    expect(result.extras).not.toHaveProperty('__proto__');
  });
});