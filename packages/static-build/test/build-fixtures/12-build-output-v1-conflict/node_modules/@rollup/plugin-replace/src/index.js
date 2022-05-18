import MagicString from 'magic-string';
import { createFilter } from '@rollup/pluginutils';

function escape(str) {
  return str.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
}

function ensureFunction(functionOrValue) {
  if (typeof functionOrValue === 'function') return functionOrValue;
  return () => functionOrValue;
}

function longest(a, b) {
  return b.length - a.length;
}

function getReplacements(options) {
  if (options.values) {
    return Object.assign({}, options.values);
  }
  const values = Object.assign({}, options);
  delete values.delimiters;
  delete values.include;
  delete values.exclude;
  delete values.sourcemap;
  delete values.sourceMap;
  delete values.objectGuards;
  return values;
}

function mapToFunctions(object) {
  return Object.keys(object).reduce((fns, key) => {
    const functions = Object.assign({}, fns);
    functions[key] = ensureFunction(object[key]);
    return functions;
  }, {});
}

const objKeyRegEx = /^([_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*)(\.([_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*))+$/;
function expandTypeofReplacements(replacements) {
  Object.keys(replacements).forEach((key) => {
    const objMatch = key.match(objKeyRegEx);
    if (!objMatch) return;
    let dotIndex = objMatch[1].length;
    let lastIndex = 0;
    do {
      // eslint-disable-next-line no-param-reassign
      replacements[`typeof ${key.slice(lastIndex, dotIndex)} ===`] = '"object" ===';
      // eslint-disable-next-line no-param-reassign
      replacements[`typeof ${key.slice(lastIndex, dotIndex)} !==`] = '"object" !==';
      // eslint-disable-next-line no-param-reassign
      replacements[`typeof ${key.slice(lastIndex, dotIndex)}===`] = '"object"===';
      // eslint-disable-next-line no-param-reassign
      replacements[`typeof ${key.slice(lastIndex, dotIndex)}!==`] = '"object"!==';
      // eslint-disable-next-line no-param-reassign
      replacements[`typeof ${key.slice(lastIndex, dotIndex)} ==`] = '"object" ===';
      // eslint-disable-next-line no-param-reassign
      replacements[`typeof ${key.slice(lastIndex, dotIndex)} !=`] = '"object" !==';
      // eslint-disable-next-line no-param-reassign
      replacements[`typeof ${key.slice(lastIndex, dotIndex)}==`] = '"object"===';
      // eslint-disable-next-line no-param-reassign
      replacements[`typeof ${key.slice(lastIndex, dotIndex)}!=`] = '"object"!==';
      lastIndex = dotIndex + 1;
      dotIndex = key.indexOf('.', lastIndex);
    } while (dotIndex !== -1);
  });
}

export default function replace(options = {}) {
  const filter = createFilter(options.include, options.exclude);
  const { delimiters = ['\\b', '\\b(?!\\.)'], preventAssignment, objectGuards } = options;
  const replacements = getReplacements(options);
  if (objectGuards) expandTypeofReplacements(replacements);
  const functionValues = mapToFunctions(replacements);
  const keys = Object.keys(functionValues).sort(longest).map(escape);
  const lookahead = preventAssignment ? '(?!\\s*=[^=])' : '';
  const pattern = new RegExp(
    `${delimiters[0]}(${keys.join('|')})${delimiters[1]}${lookahead}`,
    'g'
  );

  return {
    name: 'replace',

    buildStart() {
      if (![true, false].includes(preventAssignment)) {
        this.warn({
          message:
            "@rollup/plugin-replace: 'preventAssignment' currently defaults to false. It is recommended to set this option to `true`, as the next major version will default this option to `true`."
        });
      }
    },

    renderChunk(code, chunk) {
      const id = chunk.fileName;
      if (!keys.length) return null;
      if (!filter(id)) return null;
      return executeReplacement(code, id);
    },

    transform(code, id) {
      if (!keys.length) return null;
      if (!filter(id)) return null;
      return executeReplacement(code, id);
    }
  };

  function executeReplacement(code, id) {
    const magicString = new MagicString(code);
    if (!codeHasReplacements(code, id, magicString)) {
      return null;
    }

    const result = { code: magicString.toString() };
    if (isSourceMapEnabled()) {
      result.map = magicString.generateMap({ hires: true });
    }
    return result;
  }

  function codeHasReplacements(code, id, magicString) {
    let result = false;
    let match;

    // eslint-disable-next-line no-cond-assign
    while ((match = pattern.exec(code))) {
      result = true;

      const start = match.index;
      const end = start + match[0].length;
      const replacement = String(functionValues[match[1]](id));
      magicString.overwrite(start, end, replacement);
    }
    return result;
  }

  function isSourceMapEnabled() {
    return options.sourceMap !== false && options.sourcemap !== false;
  }
}
