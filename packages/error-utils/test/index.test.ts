import fs from 'node:fs';
import {
  isObject,
  isError,
  isErrnoException,
  isErrorLike,
  normalizeError,
  isSpawnError,
  errorToString,
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
