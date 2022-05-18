function genString(input, opts = {}) {
  const str = JSON.stringify(input);
  if (!opts.singleQuotes) {
    return JSON.stringify(input);
  }
  return `'${escapeString(str)}'`;
}
const NEEDS_ESCAPE_RE = /[\\'\r\n\u2028\u2029]/;
const QUOTE_NEWLINE_RE = /(['\r\n\u2028\u2029])/g;
const BACKSLASH_RE = /\\/g;
function escapeString(id) {
  if (!id.match(NEEDS_ESCAPE_RE)) {
    return id;
  }
  return id.replace(BACKSLASH_RE, "\\\\").replace(QUOTE_NEWLINE_RE, "\\$1");
}

function genImport(specifier, imports, opts = {}) {
  return _genStatement("import", specifier, imports, opts);
}
function genTypeImport(specifier, imports, opts = {}) {
  return _genStatement("import type", specifier, imports, opts);
}
function genTypeExport(specifier, imports, opts = {}) {
  return _genStatement("export type", specifier, imports, opts);
}
const genInlineTypeImport = (specifier, name = "default", opts = {}) => {
  return `typeof ${genDynamicImport(specifier, { ...opts, wrapper: false })}.${name}`;
};
function genExport(specifier, exports, opts = {}) {
  return _genStatement("export", specifier, exports, opts);
}
function _genStatement(type, specifier, names, opts = {}) {
  const specifierStr = genString(specifier, opts);
  if (!names) {
    return `${type} ${specifierStr};`;
  }
  const nameArray = Array.isArray(names);
  const _names = (nameArray ? names : [names]).map((i) => {
    if (typeof i === "string") {
      return { name: i };
    }
    if (i.name === i.as) {
      i = { name: i.name };
    }
    return i;
  });
  const namesStr = _names.map((i) => i.as ? `${i.name} as ${i.as}` : i.name).join(", ");
  if (nameArray) {
    return `${type} { ${namesStr} } from ${genString(specifier, opts)};`;
  }
  return `${type} ${namesStr} from ${genString(specifier, opts)};`;
}
function genDynamicImport(specifier, opts = {}) {
  const commentStr = opts.comment ? ` /* ${opts.comment} */` : "";
  const wrapperStr = opts.wrapper === false ? "" : "() => ";
  const ineropStr = opts.interopDefault ? ".then(m => m.default || m)" : "";
  return `${wrapperStr}import(${genString(specifier, opts)}${commentStr})${ineropStr}`;
}

function wrapInDelimiters(lines, indent = "", delimiters = "{}", withComma = true) {
  if (!lines.length) {
    return delimiters;
  }
  const [start, end] = delimiters;
  return `${start}
` + lines.join(withComma ? ",\n" : "\n") + `
${indent}${end}`;
}
const VALID_IDENTIFIER_RE = /^[$_]?[\w\d]*$/;
function genObjectKey(key) {
  return key.match(VALID_IDENTIFIER_RE) ? key : genString(key);
}

function genObjectFromRaw(obj, indent = "") {
  return genObjectFromRawEntries(Object.entries(obj), indent);
}
function genArrayFromRaw(array, indent = "") {
  const newIdent = indent + "  ";
  return wrapInDelimiters(array.map((i) => `${newIdent}${genRawValue(i, newIdent)}`), indent, "[]");
}
function genObjectFromRawEntries(array, indent = "") {
  const newIdent = indent + "  ";
  return wrapInDelimiters(array.map(([key, value]) => `${newIdent}${genObjectKey(key)}: ${genRawValue(value, newIdent)}`), indent, "{}");
}
function genRawValue(value, indent = "") {
  if (typeof value === "undefined") {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return genArrayFromRaw(value, indent);
  }
  if (value && typeof value === "object") {
    return genObjectFromRaw(value, indent);
  }
  return value.toString();
}

const genTypeObject = (obj, indent = "") => {
  const newIndent = indent + "  ";
  return wrapInDelimiters(Object.entries(obj).map(([key, value]) => {
    const [, k = key, optional = ""] = key.match(/^(.*[^?])(\?)?$/) || [];
    if (typeof value === "string") {
      return `${newIndent}${genObjectKey(k)}${optional}: ${value}`;
    }
    return `${newIndent}${genObjectKey(k)}${optional}: ${genTypeObject(value, newIndent)}`;
  }), indent, "{}", false);
};
const genInterface = (name, contents, options = {}) => {
  const result = [
    options.export && "export",
    `interface ${name}`,
    options.extends && `extends ${Array.isArray(options.extends) ? options.extends.join(", ") : options.extends}`,
    contents ? genTypeObject(contents) : "{}"
  ].filter(Boolean).join(" ");
  return result;
};
const genAugmentation = (specifier, interfaces) => {
  return `declare module ${genString(specifier)} ${wrapInDelimiters(Object.entries(interfaces || {}).map(([key, entry]) => "  " + (Array.isArray(entry) ? genInterface(key, ...entry) : genInterface(key, entry))))}`;
};

export { escapeString, genArrayFromRaw, genAugmentation, genDynamicImport, genExport, genImport, genInlineTypeImport, genInterface, genObjectFromRaw, genObjectFromRawEntries, genString, genTypeExport, genTypeImport, genTypeObject };
