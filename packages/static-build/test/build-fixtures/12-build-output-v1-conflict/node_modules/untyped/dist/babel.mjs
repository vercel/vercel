import * as t from '@babel/types';
import { m as mergedTypes, c as getTypeDescriptor, b as normalizeTypes, d as cachedFn } from './chunks/utils.mjs';
import 'scule';

const version = "0.4.4";

const babelPluginUntyped = function(api) {
  api.cache.using(() => version);
  return {
    visitor: {
      VariableDeclaration(p) {
        const declaration = p.node.declarations[0];
        if (t.isIdentifier(declaration.id) && (t.isFunctionExpression(declaration.init) || t.isArrowFunctionExpression(declaration.init))) {
          const newDeclaration = t.functionDeclaration(declaration.id, declaration.init.params, declaration.init.body);
          newDeclaration.returnType = declaration.init.returnType;
          p.replaceWith(newDeclaration);
        }
      },
      ObjectProperty(p) {
        if (p.node.leadingComments) {
          const schema = parseJSDocs(p.node.leadingComments.filter((c) => c.type === "CommentBlock").map((c) => c.value));
          if (p.node.value.type === "ObjectExpression") {
            const schemaProp = p.node.value.properties.find((prop) => "key" in prop && prop.key.type === "Identifier" && prop.key.name === "$schema");
            if (schemaProp && "value" in schemaProp) {
              if (schemaProp.value.type === "ObjectExpression") {
                schemaProp.value.properties.push(...astify(schema).properties);
              }
            } else {
              p.node.value.properties.unshift(...astify({ $schema: schema }).properties);
            }
          } else {
            p.node.value = t.objectExpression([
              t.objectProperty(t.identifier("$default"), p.node.value),
              t.objectProperty(t.identifier("$schema"), astify(schema))
            ]);
          }
          p.node.leadingComments = [];
        }
      },
      FunctionDeclaration(p) {
        const schema = parseJSDocs((p.parent.leadingComments || []).filter((c) => c.type === "CommentBlock").map((c) => c.value));
        schema.type = "function";
        schema.args = [];
        if (!schema.tags.includes("@untyped")) {
          return;
        }
        const _getLines = cachedFn(() => this.file.code.split("\n"));
        const getCode = (loc) => _getLines()[loc.start.line - 1].slice(loc.start.column, loc.end.column).trim() || "";
        p.node.params.forEach((param, index) => {
          if (param.loc?.end.line !== param.loc?.start.line) {
            return null;
          }
          if (!t.isAssignmentPattern(param) && !t.isIdentifier(param)) {
            return null;
          }
          const lparam = t.isAssignmentPattern(param) ? param.left : param;
          if (!t.isIdentifier(lparam)) {
            return null;
          }
          const arg = {
            name: lparam.name || "arg" + index,
            optional: lparam.optional || void 0
          };
          if (lparam.typeAnnotation) {
            Object.assign(arg, mergedTypes(arg, inferAnnotationType(lparam.typeAnnotation, getCode)));
          }
          if (param.type === "AssignmentPattern") {
            Object.assign(arg, mergedTypes(arg, inferArgType(param.right)));
          }
          schema.args = schema.args || [];
          schema.args.push(arg);
        });
        if (p.node.returnType?.type === "TSTypeAnnotation") {
          schema.returns = inferAnnotationType(p.node.returnType, getCode);
        }
        schema.tags = schema.tags?.filter((tag) => {
          if (tag.startsWith("@returns")) {
            const { type } = tag.match(/^@returns\s+\{(?<type>[\S\s]+)\}/)?.groups || {};
            if (type) {
              schema.returns = schema.returns || {};
              Object.assign(schema.returns, getTypeDescriptor(type));
              return false;
            }
          }
          if (tag.startsWith("@param")) {
            const { type, param } = tag.match(/^@param\s+\{(?<type>[\S\s]+)\}\s+(?<param>\w+)/)?.groups || {};
            if (type && param) {
              const arg = schema.args?.find((arg2) => arg2.name === param);
              if (arg) {
                Object.assign(arg, getTypeDescriptor(type));
                return false;
              }
            }
          }
          return true;
        });
        p.replaceWith(t.variableDeclaration("const", [
          t.variableDeclarator(t.identifier(p.node.id.name), astify({ $schema: schema }))
        ]));
      }
    }
  };
};
function containsIncompleteCodeblock(line = "") {
  const codeDelimiters = line.split("\n").filter((line2) => line2.startsWith("```")).length;
  return !!(codeDelimiters % 2);
}
function clumpLines(lines, delimiters = [" "], separator = " ") {
  const clumps = [];
  while (lines.length) {
    const line = lines.shift();
    if (line && !delimiters.includes(line[0]) && clumps[clumps.length - 1] || containsIncompleteCodeblock(clumps[clumps.length - 1])) {
      clumps[clumps.length - 1] += separator + line;
    } else {
      clumps.push(line);
    }
  }
  return clumps.filter(Boolean);
}
function parseJSDocs(input) {
  const schema = {
    title: "",
    description: "",
    tags: []
  };
  const lines = [].concat(input).map((c) => c.split("\n").map((l) => l.replace(/(^\s*[*]+ )|([\s*]+$)/g, ""))).flat();
  const firstTag = lines.findIndex((l) => l.startsWith("@"));
  const comments = clumpLines(lines.slice(0, firstTag >= 0 ? firstTag : void 0));
  if (comments.length === 1) {
    schema.title = comments[0];
  } else if (comments.length > 1) {
    schema.title = comments[0];
    schema.description = comments.splice(1).join("\n");
  }
  if (firstTag >= 0) {
    const tags = clumpLines(lines.slice(firstTag), ["@"], "\n");
    const typedefs = tags.reduce((typedefs2, tag) => {
      const { typedef, alias } = tag.match(/@typedef\s+\{(?<typedef>[\S\s]+)\} (?<alias>.*)/)?.groups || {};
      if (typedef && alias) {
        typedefs2[typedef] = alias;
      }
      return typedefs2;
    }, {});
    for (const tag of tags) {
      if (tag.startsWith("@type")) {
        const type = tag.match(/@type\s+\{([\S\s]+)\}/)?.[1];
        if (!type) {
          continue;
        }
        Object.assign(schema, getTypeDescriptor(type));
        for (const typedef in typedefs) {
          schema.markdownType = type;
          schema.tsType = schema.tsType.replace(new RegExp(typedefs[typedef], "g"), typedef);
        }
        continue;
      }
      schema.tags.push(tag.trim());
    }
  }
  return schema;
}
function astify(val) {
  if (typeof val === "string") {
    return t.stringLiteral(val);
  }
  if (typeof val === "boolean") {
    return t.booleanLiteral(val);
  }
  if (typeof val === "number") {
    return t.numericLiteral(val);
  }
  if (val === null) {
    return t.nullLiteral();
  }
  if (val === void 0) {
    return t.identifier("undefined");
  }
  if (Array.isArray(val)) {
    return t.arrayExpression(val.map((item) => astify(item)));
  }
  return t.objectExpression(Object.getOwnPropertyNames(val).filter((key) => val[key] !== void 0 && val[key] !== null).map((key) => t.objectProperty(t.identifier(key), astify(val[key]))));
}
const AST_JSTYPE_MAP = {
  StringLiteral: "string",
  BooleanLiteral: "boolean",
  BigIntLiteral: "bigint",
  DecimalLiteral: "number",
  NumericLiteral: "number",
  ObjectExpression: "object",
  FunctionExpression: "function",
  ArrowFunctionExpression: "function",
  RegExpLiteral: "RegExp"
};
function inferArgType(e, getCode) {
  if (AST_JSTYPE_MAP[e.type]) {
    return getTypeDescriptor(AST_JSTYPE_MAP[e.type]);
  }
  if (e.type === "AssignmentExpression") {
    return inferArgType(e.right);
  }
  if (e.type === "NewExpression" && e.callee.type === "Identifier") {
    return getTypeDescriptor(e.callee.name);
  }
  if (e.type === "ArrayExpression" || e.type === "TupleExpression") {
    const itemTypes = e.elements.filter((el) => t.isExpression(el)).flatMap((el) => inferArgType(el).type);
    return {
      type: "array",
      items: {
        type: normalizeTypes(itemTypes)
      }
    };
  }
  return {};
}
function inferAnnotationType(ann, getCode) {
  if (ann.type !== "TSTypeAnnotation") {
    return null;
  }
  return inferTSType(ann.typeAnnotation, getCode);
}
function inferTSType(tsType, getCode) {
  if (tsType.type === "TSParenthesizedType") {
    return inferTSType(tsType.typeAnnotation, getCode);
  }
  if (tsType.type === "TSTypeReference") {
    if ("name" in tsType.typeName && tsType.typeName.name === "Array") {
      return {
        type: "array",
        items: inferTSType(tsType.typeParameters.params[0], getCode)
      };
    }
    return getTypeDescriptor(getCode(tsType.loc));
  }
  if (tsType.type === "TSUnionType") {
    return mergedTypes(...tsType.types.map((t2) => inferTSType(t2, getCode)));
  }
  if (tsType.type === "TSArrayType") {
    return {
      type: "array",
      items: inferTSType(tsType.elementType, getCode)
    };
  }
  return getTypeDescriptor(getCode(tsType.loc));
}

export { babelPluginUntyped as default };
