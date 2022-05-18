export const isRegExp = (val) => val instanceof RegExp;
export const isDate = (val) => val instanceof Date;
export const isArray = (val) => Array.isArray(val);
export const isBoolean = (val) => typeof val === "boolean";
export const isNull = (val) => val === null;
export const isNullOrUndefined = (val) => val === null || val === void 0;
export const isNumber = (val) => typeof val === "number";
export const isString = (val) => typeof val === "string";
export const isSymbol = (val) => typeof val === "symbol";
export const isUndefined = (val) => typeof val === "undefined";
export const isFunction = (val) => typeof val === "function";
export const isBuffer = (val) => {
  return val && typeof val === "object" && typeof val.copy === "function" && typeof val.fill === "function" && typeof val.readUInt8 === "function";
};
export const isDeepStrictEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const isObject = (val) => val !== null && typeof val === "object" && Object.getPrototypeOf(val).isPrototypeOf(Object);
export const isError = (val) => val instanceof Error;
export const isPrimitive = (val) => {
  if (typeof val === "object") {
    return val === null;
  }
  return typeof val !== "function";
};
