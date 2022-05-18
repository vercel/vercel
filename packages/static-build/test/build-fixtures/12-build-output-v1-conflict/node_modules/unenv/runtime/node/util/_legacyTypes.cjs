"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isUndefined = exports.isSymbol = exports.isString = exports.isRegExp = exports.isPrimitive = exports.isObject = exports.isNumber = exports.isNullOrUndefined = exports.isNull = exports.isFunction = exports.isError = exports.isDeepStrictEqual = exports.isDate = exports.isBuffer = exports.isBoolean = exports.isArray = void 0;

const isRegExp = val => val instanceof RegExp;

exports.isRegExp = isRegExp;

const isDate = val => val instanceof Date;

exports.isDate = isDate;

const isArray = val => Array.isArray(val);

exports.isArray = isArray;

const isBoolean = val => typeof val === "boolean";

exports.isBoolean = isBoolean;

const isNull = val => val === null;

exports.isNull = isNull;

const isNullOrUndefined = val => val === null || val === void 0;

exports.isNullOrUndefined = isNullOrUndefined;

const isNumber = val => typeof val === "number";

exports.isNumber = isNumber;

const isString = val => typeof val === "string";

exports.isString = isString;

const isSymbol = val => typeof val === "symbol";

exports.isSymbol = isSymbol;

const isUndefined = val => typeof val === "undefined";

exports.isUndefined = isUndefined;

const isFunction = val => typeof val === "function";

exports.isFunction = isFunction;

const isBuffer = val => {
  return val && typeof val === "object" && typeof val.copy === "function" && typeof val.fill === "function" && typeof val.readUInt8 === "function";
};

exports.isBuffer = isBuffer;

const isDeepStrictEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

exports.isDeepStrictEqual = isDeepStrictEqual;

const isObject = val => val !== null && typeof val === "object" && Object.getPrototypeOf(val).isPrototypeOf(Object);

exports.isObject = isObject;

const isError = val => val instanceof Error;

exports.isError = isError;

const isPrimitive = val => {
  if (typeof val === "object") {
    return val === null;
  }

  return typeof val !== "function";
};

exports.isPrimitive = isPrimitive;