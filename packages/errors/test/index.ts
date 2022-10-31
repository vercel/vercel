import fs from 'fs';
import {
  isObject,
  isError,
  isErrnoException,
  isErrorLike,
  normalizeError,
  isSpawnError,
  errorToString,
} from '../src';
import tap from 'tap';

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

tap.test('isObject returns true for objects only', t => {
  for (const item of [ARRAY, new CLASS(), OBJECT]) {
    t.ok(isObject(item));
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
    t.notOk(isObject(item));
  }
  t.end();
});

tap.test('isError returns true for Error instances only', t => {
  for (const error of [
    new Error(),
    new EvalError(),
    new RangeError(),
    new ReferenceError(),
    new SyntaxError(),
    new TypeError(),
    new URIError(),
  ]) {
    t.ok(isError(error));
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
    t.notOk(isError(item));
  }
  t.end();
});

tap.test('isError returns true for objects with an Error prototype', t => {
  class Derived extends Error {}
  const err = new Derived();
  t.ok(isError(err));
  t.end();
});

tap.test('isErrnoException returns true for NodeJS.ErrnoException only', t => {
  try {
    fs.statSync('./i-definitely-do-not-exist');
    t.fail();
  } catch (err) {
    t.ok(isErrnoException(err));
  }
  t.end();
});

tap.test('isErrorLike returns true when object is like an error', t => {
  t.ok(isErrorLike(new Error()));
  t.ok(isErrorLike({ message: '' }));
  t.notOk(isErrorLike({}));
  t.end();
});

tap.test('errorToString', t => {
  const message = 'message';
  t.strictSame(
    errorToString(new Error(message)),
    message,
    'return `message` when first argument is an error'
  );
  t.strictSame(
    errorToString({ message }),
    message,
    'returns `message` when first argument is error like'
  );
  t.strictSame(
    errorToString(message),
    message,
    'returns first argument when it is a string'
  );
  t.strictSame(
    errorToString(null, message),
    message,
    'returns second argument when first argument is not an error, error like, nor a string'
  );
  t.strictSame(
    errorToString(null),
    'An unknown error has ocurred.',
    'returns default fallback message when first argument is not an error, error like, nor a string, and the second argument is not provided'
  );
  t.end();
});

tap.test('normalizeError', t => {
  const message = 'message';
  t.strictSame(
    normalizeError(new Error(message)),
    new Error(message),
    'returns first argument if it is an error'
  );
  t.strictSame(
    normalizeError(message),
    new Error(message),
    'returns a new error if argument is not error like'
  );
  t.strictSame(
    normalizeError({ message }),
    new Error(message),
    'returns a new error if argument is not error like'
  );
  t.strictSame(
    normalizeError(null),
    new Error('An unknown error has ocurred.'),
    'returns a new error with fallback message if argument is not error like nor a string.'
  );
  t.strictSame(
    normalizeError({ message, prop: 'value' }),
    Object.assign(new Error(message), { prop: 'value' }),
    'returns an Error with the input object assigned to it'
  );
  t.end();
});

tap.test('isSpawnError', t => {
  const spawnError = new Error('spawn error');
  Object.assign(spawnError, {
    code: 'SPAWN_ERROR',
    spawnargs: ['a', 'b', 'c'],
  });
  t.ok(isSpawnError(spawnError));
  t.notOk(isSpawnError(new Error('not spawn error')));
  t.end();
});
