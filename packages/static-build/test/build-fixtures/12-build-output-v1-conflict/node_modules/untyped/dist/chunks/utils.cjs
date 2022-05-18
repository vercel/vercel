'use strict';

const scule = require('scule');

function escapeKey(val) {
  return /^\w+$/.test(val) ? val : `"${val}"`;
}
function getType(val) {
  const type = typeof val;
  if (type === "undefined" || val === null) {
    return void 0;
  }
  if (Array.isArray(val)) {
    return "array";
  }
  return type;
}
function isObject(val) {
  return val !== null && !Array.isArray(val) && typeof val === "object";
}
function nonEmpty(arr) {
  return arr.filter(Boolean);
}
function unique(arr) {
  return Array.from(new Set(arr));
}
function joinPath(a, b = "", sep = ".") {
  return a ? a + sep + b : b;
}
function setValue(obj, path, val) {
  const keys = path.split(".");
  const _key = keys.pop();
  for (const key of keys) {
    if (!obj || typeof obj !== "object") {
      return;
    }
    if (!(key in obj)) {
      obj[key] = {};
    }
    obj = obj[key];
  }
  if (_key) {
    if (!obj || typeof obj !== "object") {
      return;
    }
    obj[_key] = val;
  }
}
function getValue(obj, path) {
  for (const key of path.split(".")) {
    if (!obj || typeof obj !== "object" || !(key in obj)) {
      return void 0;
    }
    obj = obj[key];
  }
  return obj;
}
function mergedTypes(...types) {
  types = types.filter(Boolean);
  if (types.length === 0) {
    return {};
  }
  if (types.length === 1) {
    return types[0];
  }
  const tsTypes = normalizeTypes(types.map((t) => t.tsType).flat().filter(Boolean));
  return {
    type: normalizeTypes(types.map((t) => t.type).flat().filter(Boolean)),
    tsType: Array.isArray(tsTypes) ? tsTypes.join(" | ") : tsTypes,
    items: mergedTypes(...types.map((t) => t.items).flat().filter(Boolean))
  };
}
function normalizeTypes(val) {
  const arr = unique(val.filter((str) => str));
  if (!arr.length || arr.includes("any")) {
    return void 0;
  }
  return arr.length > 1 ? arr : arr[0];
}
function cachedFn(fn) {
  let val;
  let resolved = false;
  return () => {
    if (!resolved) {
      val = fn();
      resolved = true;
    }
    return val;
  };
}
const jsTypes = ["string", "number", "bigint", "boolean", "symbol", "function", "object", "any", "array"];
function isJSType(val) {
  return jsTypes.includes(val);
}
const FRIENDLY_TYPE_RE = /(typeof )?import\(['"](?<importName>[^'"]+)['"]\)(\[['"]|\.)(?<firstType>[^'"\s]+)(['"]\])?/g;
function getTypeDescriptor(type) {
  if (!type) {
    return {};
  }
  let markdownType = type;
  for (const match of type.matchAll(FRIENDLY_TYPE_RE) || []) {
    const { importName, firstType } = match.groups || {};
    if (importName && firstType) {
      markdownType = markdownType.replace(match[0], scule.pascalCase(importName) + scule.pascalCase(firstType));
    }
  }
  return {
    ...isJSType(type) ? { type } : {},
    tsType: type,
    ...markdownType !== type ? { markdownType } : {}
  };
}

exports.cachedFn = cachedFn;
exports.escapeKey = escapeKey;
exports.getType = getType;
exports.getTypeDescriptor = getTypeDescriptor;
exports.getValue = getValue;
exports.isObject = isObject;
exports.joinPath = joinPath;
exports.mergedTypes = mergedTypes;
exports.nonEmpty = nonEmpty;
exports.normalizeTypes = normalizeTypes;
exports.setValue = setValue;
exports.unique = unique;
