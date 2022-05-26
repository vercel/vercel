import type {
  ArrayExpression,
  BooleanLiteral,
  ExportDeclaration,
  Identifier,
  KeyValueProperty,
  Module,
  Node,
  NullLiteral,
  NumericLiteral,
  ObjectExpression,
  StringLiteral,
  VariableDeclaration,
} from '@swc/core';
import { FromSchema, JSONSchema } from 'json-schema-to-ts';
import { validate } from './validation';

function isExportDeclaration(node: Node): node is ExportDeclaration {
  return node.type === 'ExportDeclaration';
}

function isVariableDeclaration(node: Node): node is VariableDeclaration {
  return node.type === 'VariableDeclaration';
}

function isIdentifier(node: Node): node is Identifier {
  return node.type === 'Identifier';
}

function isBooleanLiteral(node: Node): node is BooleanLiteral {
  return node.type === 'BooleanLiteral';
}

function isNullLiteral(node: Node): node is NullLiteral {
  return node.type === 'NullLiteral';
}

function isStringLiteral(node: Node): node is StringLiteral {
  return node.type === 'StringLiteral';
}

function isNumericLiteral(node: Node): node is NumericLiteral {
  return node.type === 'NumericLiteral';
}

function isArrayExpression(node: Node): node is ArrayExpression {
  return node.type === 'ArrayExpression';
}

function isObjectExpression(node: Node): node is ObjectExpression {
  return node.type === 'ObjectExpression';
}

function isKeyValueProperty(node: Node): node is KeyValueProperty {
  return node.type === 'KeyValueProperty';
}

export type Value = undefined | null | boolean | string | number | any[] | Record<string, any>;
export class UnsupportedValueError extends Error {}

function extractValue(node: Node): Value {
  if (isNullLiteral(node)) {
    return null;
  } else if (isBooleanLiteral(node)) {
    // e.g. true / false
    return node.value;
  } else if (isStringLiteral(node)) {
    // e.g. "abc"
    return node.value;
  } else if (isNumericLiteral(node)) {
    // e.g. 123
    return node.value;
  } else if (isIdentifier(node)) {
    switch (node.value) {
      case 'undefined':
        return undefined;
      default:
        throw new UnsupportedValueError();
    }
  } else if (isArrayExpression(node)) {
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
  } else if (isObjectExpression(node)) {
    // e.g. { a: 1, b: 2 }
    const obj: Record<string, any> = {};
    for (const prop of node.properties) {
      if (!isKeyValueProperty(prop)) {
        // e.g. { ...a }
        throw new UnsupportedValueError();
      }

      let key: string;
      if (isIdentifier(prop.key)) {
        // e.g. { a: 1, b: 2 }
        key = prop.key.value;
      } else if (isStringLiteral(prop.key)) {
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
    if (!isExportDeclaration(moduleItem)) {
      continue;
    }

    const declration = moduleItem.declaration;
    if (!isVariableDeclaration(declration)) {
      continue;
    }

    if (declration.kind !== 'const') {
      continue;
    }

    for (const decl of declration.declarations) {
      if (
        isIdentifier(decl.id) &&
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
export function getConfig<T extends JSONSchema>(module: Module, schema?: T): FromSchema<T> | null {
  const data = extractExportedConstValue(module, 'config');
  if (!data) {
    return null;
  }

  if (schema) {
    validate(schema, data);
  }
  return data as FromSchema<T>;
}
