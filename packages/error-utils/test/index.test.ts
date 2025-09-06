import fs from 'node:fs';
import {
  isObject,
  isError,
  isErrnoException,
  isErrorLike,
  normalizeError,
  isSpawnError,
  errorToString,
  isSafeKey,
  getSafeEntries,
  safeAssign,
} from '../src';

const ARRAY: any[] = [];
const BIGINT = 1n;
const BOOLEAN = true;
const FUNCTION = () => {};
const NULL = null;
const NUMBER = 0;
const OBJECT = {};
const STRING = '';
const SYMBOL = Symbol('');
const UNDEFINED = undefined;

class CLASS {} // `CLASS` is a function and `new CLASS()` is an Object

test('isObject returns true for objects only', () => {
  for (const item of [ARRAY, new CLASS(), OBJECT]) {
    expect(isObject(item)).toBe(true);
  }
  for (const item of [
    BIGINT,
    BOOLEAN,
    CLASS,
    FUNCTION,
    NULL,
    NUMBER,
    STRING,
    SYMBOL,
    UNDEFINED,
  ]) {
    expect(isObject(item)).toBe(false);
  }
});

test('isError returns true for Error instances only', () => {
  for (const error of [
    new Error(),
    new EvalError(),
    new RangeError(),
    new ReferenceError(),
    new SyntaxError(),
    new TypeError(),
    new URIError(),
  ]) {
    expect(isError(error)).toBe(true);
  }
  for (const item of [
    ARRAY,
    BIGINT,
    BOOLEAN,
    CLASS,
    new CLASS(),
    FUNCTION,
    NULL,
    NUMBER,
    OBJECT,
    STRING,
    SYMBOL,
    UNDEFINED,
  ]) {
    expect(isError(item)).toBe(false);
  }
});

test('isError returns true for objects with a nested Error prototype', () => {
  class Foo {}
  const err = new Error();
  Object.setPrototypeOf(err, Foo.prototype);
  expect(isError(err)).toBe(true);
});

test('isErrnoException returns true for NodeJS.ErrnoException only', () => {
  try {
    fs.statSync('./i-definitely-do-not-exist');
    fail();
  } catch (err) {
    expect(isErrnoException(err)).toBe(true);
  }
});

test('isErrorLike returns true when object is like an error', () => {
  expect(isErrorLike(new Error())).toBe(true);
  expect(isErrorLike({ message: '' })).toBe(true);
  expect(isErrorLike({})).toBe(false);
});

describe('errorToString', () => {
  const message = 'message';
  test('return `message` when first argument is an error', () => {
    expect(errorToString(new Error(message))).toStrictEqual(message);
  });
  test('returns `message` when first argument is error like', () => {
    expect(errorToString({ message })).toStrictEqual(message);
  });
  test('returns first argument when it is a string', () => {
    expect(errorToString(message)).toStrictEqual(message);
  });
  test('returns second argument when first argument is not an error, error like, nor a string', () => {
    expect(errorToString(null, message)).toStrictEqual(message);
  });
  test('returns default fallback message when first argument is not an error, error like, nor a string, and the second argument is not provided', () => {
    expect(errorToString(null)).toStrictEqual('An unknown error has ocurred.');
  });
});

describe('normalizeError', () => {
  const message = 'message';
  test('returns first argument if it is an error', () => {
    expect(normalizeError(new Error(message))).toStrictEqual(
      new Error(message)
    );
  });
  test('returns a new error if argument is not error like', () => {
    expect(normalizeError(message)).toStrictEqual(new Error(message));
  });
  test('returns a new error if argument is not error like', () => {
    expect(normalizeError({ message })).toStrictEqual(new Error(message));
  });
  test('returns a new error with fallback message if argument is not error like nor a string.', () => {
    expect(normalizeError(null)).toStrictEqual(
      new Error('An unknown error has ocurred.')
    );
  });
  test('returns an Error with the input object assigned to it', () => {
    expect(normalizeError({ message, prop: 'value' })).toStrictEqual(
      Object.assign(new Error(message), { prop: 'value' })
    );
  });
});

test('isSpawnError', () => {
  const spawnError = new Error('spawn error');
  Object.assign(spawnError, {
    code: 'SPAWN_ERROR',
    spawnargs: ['a', 'b', 'c'],
  });
  expect(isSpawnError(spawnError)).toBe(true);
  expect(isSpawnError(new Error('not spawn error'))).toBe(false);
});

describe('Security - Prototype Pollution Protection', () => {
  describe('isSafeKey', () => {
    test('should return true for safe keys', () => {
      expect(isSafeKey('userId')).toBe(true);
      expect(isSafeKey('requestId')).toBe(true);
      expect(isSafeKey('customData')).toBe(true);
      expect(isSafeKey('normal_key')).toBe(true);
    });

    test('should return false for dangerous keys', () => {
      expect(isSafeKey('__proto__')).toBe(false);
      expect(isSafeKey('constructor')).toBe(false);
      expect(isSafeKey('prototype')).toBe(false);
    });
  });

  describe('getSafeEntries', () => {
    test('should return only safe entries', () => {
      const input = {
        userId: '123',
        __proto__: { polluted: true },
        constructor: { prototype: { polluted: true } },
        prototype: { polluted: true },
        safeKey: 'safe value',
      };

      const result = getSafeEntries(input);

      expect(result).toEqual([
        ['userId', '123'],
        ['safeKey', 'safe value'],
      ]);
    });

    test('should return empty array for object with only dangerous keys', () => {
      const input = {
        __proto__: { polluted: true },
        constructor: { prototype: { polluted: true } },
        prototype: { polluted: true },
      };

      const result = getSafeEntries(input);
      expect(result).toEqual([]);
    });
  });

  describe('safeAssign', () => {
    test('should assign only safe properties', () => {
      const target: Record<string, any> = {};
      const source = {
        userId: '123',
        __proto__: { polluted: true },
        constructor: { prototype: { polluted: true } },
        prototype: { polluted: true },
        safeKey: 'safe value',
      };

      safeAssign(target, source);

      expect(target).toEqual({
        userId: '123',
        safeKey: 'safe value',
      });
    });

    test('should not pollute target object', () => {
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
      expect(target).toEqual({});
    });
  });
});
