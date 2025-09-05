import { isSafeKey, getSafeEntries, safeAssign } from '../safe-object-utils';

describe('Safe Object Utils - Prototype Pollution Protection', () => {
  describe('isSafeKey', () => {
    test('should return true for safe keys', () => {
      expect(isSafeKey('userId')).toBe(true);
      expect(isSafeKey('requestId')).toBe(true);
      expect(isSafeKey('customData')).toBe(true);
      expect(isSafeKey('normal_key')).toBe(true);
      expect(isSafeKey('camelCaseKey')).toBe(true);
      expect(isSafeKey('PascalCaseKey')).toBe(true);
      expect(isSafeKey('kebab-case-key')).toBe(true);
      expect(isSafeKey('snake_case_key')).toBe(true);
      expect(isSafeKey('123')).toBe(true);
      expect(isSafeKey('')).toBe(true);
    });

    test('should return false for dangerous keys', () => {
      expect(isSafeKey('__proto__')).toBe(false);
      expect(isSafeKey('constructor')).toBe(false);
      expect(isSafeKey('prototype')).toBe(false);
    });
  });

  describe('getSafeEntries', () => {
    test('should return safe entries only', () => {
      const obj = {
        userId: '123',
        requestId: 'abc',
        __proto__: { polluted: true },
        constructor: { prototype: { polluted: true } },
        prototype: { polluted: true },
        safeKey: 'safe value',
      };

      const safeEntries = getSafeEntries(obj);

      expect(safeEntries).toEqual([
        ['userId', '123'],
        ['requestId', 'abc'],
        ['safeKey', 'safe value'],
      ]);

      // Verify dangerous keys are filtered out
      expect(safeEntries.find(([key]) => key === '__proto__')).toBeUndefined();
      expect(safeEntries.find(([key]) => key === 'constructor')).toBeUndefined();
      expect(safeEntries.find(([key]) => key === 'prototype')).toBeUndefined();
    });

    test('should handle empty object', () => {
      const obj = {};
      const safeEntries = getSafeEntries(obj);
      expect(safeEntries).toEqual([]);
    });

    test('should handle object with only dangerous keys', () => {
      const obj = {
        __proto__: { polluted: true },
        constructor: { prototype: { polluted: true } },
        prototype: { polluted: true },
      };

      const safeEntries = getSafeEntries(obj);
      expect(safeEntries).toEqual([]);
    });
  });

  describe('safeAssign', () => {
    test('should assign safe properties only', () => {
      const target: Record<string, any> = {};
      const source = {
        userId: '123',
        requestId: 'abc',
        __proto__: { polluted: true },
        constructor: { prototype: { polluted: true } },
        prototype: { polluted: true },
        safeKey: 'safe value',
      };

      safeAssign(target, source);

      expect(target).toEqual({
        userId: '123',
        requestId: 'abc',
        safeKey: 'safe value',
      });

      // Verify dangerous keys are not assigned
      expect(target).not.toHaveProperty('__proto__');
      expect(target).not.toHaveProperty('constructor');
      expect(target).not.toHaveProperty('prototype');
    });

    test('should not pollute Object.prototype', () => {
      const target: Record<string, any> = {};
      const source = {
        __proto__: { polluted: true },
        constructor: { prototype: { polluted: true } },
        prototype: { polluted: true },
      };

      // Store original prototype state
      const originalPrototype = Object.prototype;
      const originalConstructor = originalPrototype.constructor;

      safeAssign(target, source);

      // Verify Object.prototype is not polluted
      expect(Object.prototype).toBe(originalPrototype);
      expect(Object.prototype.constructor).toBe(originalConstructor);
      expect((Object.prototype as any).polluted).toBeUndefined();
    });

    test('should handle empty source object', () => {
      const target: Record<string, any> = { existing: 'value' };
      const source = {};

      safeAssign(target, source);

      expect(target).toEqual({ existing: 'value' });
    });

    test('should preserve existing target properties', () => {
      const target: Record<string, any> = { existing: 'value' };
      const source = { newKey: 'new value' };

      safeAssign(target, source);

      expect(target).toEqual({
        existing: 'value',
        newKey: 'new value',
      });
    });
  });
});