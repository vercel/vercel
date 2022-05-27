import type { Expression, Module } from '@swc/core';
import { FromSchema, JSONSchema } from 'json-schema-to-ts';
import { validate } from './validation';

export type Value =
  | undefined
  | null
  | boolean
  | string
  | number
  | any[]
  | Record<string, any>;
export class UnsupportedValueError extends Error {}

function extractValue(node: Expression): Value {
  if (node.type === 'NullLiteral') {
    return null;
  } else if (node.type === 'BooleanLiteral') {
    // e.g. true / false
    return node.value;
  } else if (node.type === 'StringLiteral') {
    // e.g. "abc"
    return node.value;
  } else if (node.type === 'NumericLiteral') {
    // e.g. 123
    return node.value;
  } else if (node.type === 'Identifier') {
    switch (node.value) {
      case 'undefined':
        return undefined;
      default:
        throw new UnsupportedValueError();
    }
  } else if (node.type === 'ArrayExpression') {
    // e.g. [1, 2, 3]
    const arr = [];
    for (const elem of node.elements) {
      if (elem) {
        if (elem.spread) {
          // e.g. [ ...a ]
          throw new UnsupportedValueError();
        }

        arr.push(extractValue(elem.expression));
      } else {
        // e.g. [1, , 2]
        //         ^^
        arr.push(undefined);
      }
    }
    return arr;
  } else if (node.type === 'ObjectExpression') {
    // e.g. { a: 1, b: 2 }
    const obj: Record<string, any> = {};
    for (const prop of node.properties) {
      if (prop.type !== 'KeyValueProperty') {
        // e.g. { ...a }
        throw new UnsupportedValueError();
      }

      let key: string;
      if (prop.key.type === 'Identifier') {
        // e.g. { a: 1, b: 2 }
        key = prop.key.value;
      } else if (prop.key.type === 'StringLiteral') {
        // e.g. { "a": 1, "b": 2 }
        key = prop.key.value;
      } else {
        throw new UnsupportedValueError();
      }

      obj[key] = extractValue(prop.value);
    }

    return obj;
  } else {
    throw new UnsupportedValueError();
  }
}

// Extracts the value of an exported const variable named `exportedName`
// (e.g. "export const config = { runtime: 'edge' }") from swc's AST.
//
// The value must be one of (or throws UnsupportedValueError):
//
// - string
// - boolean
// - number
// - null
// - undefined
// - array containing values listed in this list
// - object containing values listed in this list
//
export function extractExportedConstValue(
  module: Module,
  exportedName: string
): Value | null {
  for (const moduleItem of module.body) {
    if (moduleItem.type !== 'ExportDeclaration') {
      continue;
    }

    const { declaration } = moduleItem;
    if (declaration.type !== 'VariableDeclaration') {
      continue;
    }

    if (declaration.kind !== 'const') {
      continue;
    }

    for (const decl of declaration.declarations) {
      if (
        decl.id.type === 'Identifier' &&
        decl.id.value === exportedName &&
        decl.init
      ) {
        return extractValue(decl.init);
      }
    }
  }

  return null;
}

// Extracts the value of `export const config` in the given swc AST (`module`).
//
// Returns null if the declaration is not found.
//
// Throws exceptions if it contains a syntax node which're not literal or
// the validation fails.
export function getConfig<T extends JSONSchema>(
  module: Module,
  schema?: T
): FromSchema<T> | null {
  const data = extractExportedConstValue(module, 'config');
  if (!data) {
    return null;
  }

  if (schema) {
    validate(schema, data);
  }
  return data as FromSchema<T>;
}
