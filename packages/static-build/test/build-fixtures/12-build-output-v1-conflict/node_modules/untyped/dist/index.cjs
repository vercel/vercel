'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const utils = require('./chunks/utils.cjs');
require('scule');

function resolveSchema(obj, defaults) {
  const schema = _resolveSchema(obj, "", {
    root: obj,
    defaults,
    resolveCache: {}
  });
  return schema;
}
function _resolveSchema(input, id, ctx) {
  if (id in ctx.resolveCache) {
    return ctx.resolveCache[id];
  }
  if (!utils.isObject(input)) {
    const schema2 = {
      type: utils.getType(input),
      default: Array.isArray(input) ? [...input] : input
    };
    normalizeSchema(schema2);
    ctx.resolveCache[id] = schema2;
    if (ctx.defaults && utils.getValue(ctx.defaults, id) === void 0) {
      utils.setValue(ctx.defaults, id, schema2.default);
    }
    return schema2;
  }
  const node = { ...input };
  const schema = ctx.resolveCache[id] = {
    ...node.$schema,
    id: "#" + id.replace(/\./g, "/")
  };
  for (const key in node) {
    if (key === "$resolve" || key === "$schema" || key === "$default") {
      continue;
    }
    schema.properties = schema.properties || {};
    if (!schema.properties[key]) {
      schema.properties[key] = _resolveSchema(node[key], utils.joinPath(id, key), ctx);
    }
  }
  if (ctx.defaults) {
    schema.default = utils.getValue(ctx.defaults, id);
  }
  if (schema.default === void 0 && "$default" in node) {
    schema.default = node.$default;
  }
  if (typeof node.$resolve === "function") {
    schema.default = node.$resolve(schema.default, (key) => {
      return _resolveSchema(utils.getValue(ctx.root, key), key, ctx).default;
    });
  }
  if (ctx.defaults) {
    utils.setValue(ctx.defaults, id, schema.default);
  }
  if (!schema.type) {
    schema.type = utils.getType(schema.default) || (schema.properties ? "object" : "any");
  }
  normalizeSchema(schema);
  if (ctx.defaults && utils.getValue(ctx.defaults, id) === void 0) {
    utils.setValue(ctx.defaults, id, schema.default);
  }
  return schema;
}
function applyDefaults(ref, input) {
  resolveSchema(ref, input);
  return input;
}
function normalizeSchema(schema) {
  if (schema.type === "array" && !("items" in schema)) {
    schema.items = {
      type: utils.nonEmpty(utils.unique(schema.default.map((i) => utils.getType(i))))
    };
    if (!schema.items.type.length) {
      schema.items.type = "any";
    }
  }
  if (schema.default === void 0 && ("properties" in schema || schema.type === "object" || schema.type === "any")) {
    const propsWithDefaults = Object.entries(schema.properties || {}).filter(([, prop]) => "default" in prop).map(([key, value]) => [key, value.default]);
    schema.default = Object.fromEntries(propsWithDefaults);
  }
}

const GenerateTypesDefaults = {
  interfaceName: "Untyped",
  addExport: true,
  addDefaults: true,
  allowExtraKeys: void 0,
  indentation: 0
};
const TYPE_MAP = {
  array: "any[]",
  bigint: "bigint",
  boolean: "boolean",
  number: "number",
  object: "any",
  any: "any",
  string: "string",
  symbol: "Symbol",
  function: "Function"
};
const SCHEMA_KEYS = [
  "items",
  "default",
  "resolve",
  "properties",
  "title",
  "description",
  "$schema",
  "type",
  "tsType",
  "markdownType",
  "tags",
  "args",
  "id",
  "returns"
];
const DECLARATION_RE = /typeof import\(['"](?<source>[^)]+)['"]\)(\.(?<type>\w+)|\[['"](?<type1>\w+)['"]\])/g;
function extractTypeImports(declarations) {
  const typeImports = {};
  const aliases = /* @__PURE__ */ new Set();
  const imports = [];
  for (const match of declarations.matchAll(DECLARATION_RE)) {
    const { source, type1, type = type1 } = match.groups || {};
    typeImports[source] = typeImports[source] || /* @__PURE__ */ new Set();
    typeImports[source].add(type);
  }
  for (const source in typeImports) {
    const sourceImports = [];
    for (const type of typeImports[source]) {
      let count = 0;
      let alias = type;
      while (aliases.has(alias)) {
        alias = `${type}${count++}`;
      }
      aliases.add(alias);
      sourceImports.push(alias === type ? type : `${type} as ${alias}`);
      declarations = declarations.replace(new RegExp(`typeof import\\(['"]${source}['"]\\)(\\.${type}|\\[['"]${type}['"]\\])`, "g"), alias);
    }
    imports.push(`import type { ${sourceImports.join(", ")} } from '${source}'`);
  }
  return [...imports, declarations].join("\n");
}
function generateTypes(schema, opts = {}) {
  opts = { ...GenerateTypesDefaults, ...opts };
  const baseIden = " ".repeat(opts.indentation);
  const interfaceCode = `interface ${opts.interfaceName} {
  ` + _genTypes(schema, baseIden + " ", opts).join("\n ") + `
${baseIden}}`;
  if (!opts.addExport) {
    return baseIden + interfaceCode;
  }
  return extractTypeImports(baseIden + `export ${interfaceCode}`);
}
function _genTypes(schema, spaces, opts) {
  const buff = [];
  for (const key in schema.properties) {
    const val = schema.properties[key];
    buff.push(...generateJSDoc(val, opts));
    if (val.tsType) {
      buff.push(`${utils.escapeKey(key)}: ${val.tsType},
`);
    } else if (val.type === "object") {
      buff.push(`${utils.escapeKey(key)}: {`, ..._genTypes(val, spaces + " ", opts), "},\n");
    } else {
      let type;
      if (val.type === "array") {
        type = `Array<${getTsType(val.items)}>`;
      } else if (val.type === "function") {
        type = genFunctionType(val);
      } else {
        type = getTsType(val);
      }
      buff.push(`${utils.escapeKey(key)}: ${type},
`);
    }
  }
  if (buff.length) {
    const last = buff.pop() || "";
    buff.push(last.substr(0, last.length - 1));
  }
  if (opts.allowExtraKeys === true || !buff.length && opts.allowExtraKeys !== false) {
    buff.push("[key: string]: any");
  }
  return buff.map((i) => spaces + i);
}
function getTsType(type) {
  if (Array.isArray(type)) {
    return [].concat(utils.normalizeTypes(type.map((t) => getTsType(t)))).join("|") || "any";
  }
  if (!type) {
    return "any";
  }
  if (type.tsType) {
    return type.tsType;
  }
  if (!type.type) {
    return "any";
  }
  if (Array.isArray(type.type)) {
    return type.type.map((t) => TYPE_MAP[t]).join("|");
  }
  if (type.type === "array") {
    return `Array<${getTsType(type.items)}>`;
  }
  return TYPE_MAP[type.type] || type.type;
}
function genFunctionType(schema) {
  return `(${genFunctionArgs(schema.args)}) => ${getTsType(schema.returns)}`;
}
function genFunctionArgs(args) {
  return args?.map((arg) => {
    let argStr = arg.name;
    if (arg.optional || arg.default) {
      argStr += "?";
    }
    if (arg.type || arg.tsType) {
      argStr += `: ${getTsType(arg)}`;
    }
    return argStr;
  }).join(", ") || "";
}
function generateJSDoc(schema, opts) {
  let buff = [];
  if (schema.title) {
    buff.push(schema.title);
  }
  if (schema.description) {
    buff.push(schema.description);
  } else if (opts.defaultDescrption && schema.type !== "object") {
    buff.push(opts.defaultDescrption);
  }
  if (opts.addDefaults && schema.type !== "object" && schema.type !== "any" && !(Array.isArray(schema.default) && schema.default.length === 0)) {
    const stringified = JSON.stringify(schema.default);
    if (stringified) {
      buff.push(`@default ${stringified.replace(/\*\//g, "*\\/")}`);
    }
  }
  for (const key in schema) {
    if (!SCHEMA_KEYS.includes(key)) {
      buff.push("", `@${key} ${schema[key]}`);
    }
  }
  if (Array.isArray(schema.tags)) {
    for (const tag of schema.tags) {
      if (tag !== "@untyped") {
        buff.push("", tag);
      }
    }
  }
  buff = buff.map((i) => i.split("\n")).flat();
  if (buff.length) {
    return buff.length === 1 ? ["/** " + buff[0] + " */"] : ["/**", ...buff.map((i) => ` * ${i}`), "*/"];
  }
  return [];
}

function generateMarkdown(schema) {
  return _generateMarkdown(schema, "", "").join("\n");
}
function _generateMarkdown(schema, title, level) {
  const lines = [];
  lines.push(`${level} ${title}`);
  if (schema.type === "object") {
    for (const key in schema.properties) {
      const val = schema.properties[key];
      lines.push("", ..._generateMarkdown(val, `\`${key}\``, level + "#"));
    }
    return lines;
  }
  lines.push(`- **Type**: \`${schema.markdownType || schema.tsType || schema.type}\``);
  if ("default" in schema) {
    lines.push(`- **Default**: \`${JSON.stringify(schema.default)}\``);
  }
  lines.push("");
  if (schema.title) {
    lines.push("> " + schema.title, "");
  }
  if (schema.type === "function") {
    lines.push("```ts", genFunctionType(schema), "```", "");
  }
  if (schema.description) {
    lines.push("", schema.description, "");
  }
  return lines;
}

exports.applyDefaults = applyDefaults;
exports.generateMarkdown = generateMarkdown;
exports.generateTypes = generateTypes;
exports.resolveSchema = resolveSchema;
