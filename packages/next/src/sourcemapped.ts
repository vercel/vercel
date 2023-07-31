import type { RawSourceMap } from 'source-map';
import convertSourceMap from 'convert-source-map';
import fs from 'fs-extra';
import {
  ConcatSource,
  OriginalSource,
  SourceMapSource,
  Source,
} from 'webpack-sources';

/**
 * A template literal tag that preserves existing source maps, if any. This
 * allows to compose multiple sources and preserve the source maps, so we can
 * resolve the correct line numbers in the stack traces later on.
 *
 * @param strings The string literals.
 * @param sources All the sources that may optionally have source maps. Use
 * `raw` to pass a string that should be inserted raw (with no source map
 * attached).
 */
export function sourcemapped(
  strings: TemplateStringsArray,
  ...sources: Source[]
): Source {
  const concat = new ConcatSource();

  for (let i = 0; i < Math.max(strings.length, sources.length); i++) {
    const string = strings[i];
    const source = sources[i];
    if (string) concat.add(raw(string));
    if (source) concat.add(source);
  }

  return concat;
}

/**
 * A helper to create a Source from a string with no source map.
 * This allows to obfuscate the source code from the user and print `[native code]`
 * when resolving the stack trace.
 */
export function raw(value: string) {
  return new OriginalSource(value, '[native code]');
}

/**
 * Takes a file with contents and tries to extract its source maps it will
 * first try to use a `${fullFilePath}.map` file if it exists. Then, it will
 * try to use the inline source map comment.
 *
 * @param content The file contents.
 * @param sourceName the name of the source.
 * @param fullFilePath The full path to the file.
 */
export async function fileToSource(
  content: string,
  sourceName: string,
  fullFilePath?: string
): Promise<Source> {
  const sourcemap = await getSourceMap(content, fullFilePath);
  const cleanContent = removeInlinedSourceMap(content);
  return sourcemap
    ? new SourceMapSource(cleanContent, sourceName, sourcemap)
    : new OriginalSource(cleanContent, sourceName);
}

/**
 * Finds a source map for a given content and file path. First it will try to
 * use a `${fullFilePath}.map` file if it exists. Then, it will try to use
 * the inline source map comment.
 */
async function getSourceMap(
  content: string,
  fullFilePath?: string
): Promise<RawSourceMap | null> {
  try {
    if (fullFilePath && (await fs.pathExists(`${fullFilePath}.map`))) {
      const mapJson = await fs.readFile(`${fullFilePath}.map`, 'utf8');
      return convertSourceMap.fromJSON(mapJson).toObject();
    }
    return convertSourceMap.fromComment(content).toObject();
  } catch {
    return null;
  }
}

/**
 * Stringifies a source map, removing unnecessary data:
 * * `sourcesContent` is not needed to trace back frames.
 */
export function stringifySourceMap(
  sourceMap?: RawSourceMap | string | null
): string | undefined {
  if (!sourceMap) return;
  const obj =
    typeof sourceMap === 'object'
      ? { ...sourceMap }
      : convertSourceMap.fromJSON(sourceMap).toObject();
  delete obj.sourcesContent;
  return JSON.stringify(obj);
}

// https://github.com/thlorenz/convert-source-map/blob/master/index.js#L4 (MIT license)
// Groups: 1: media type, 2: MIME type, 3: charset, 4: encoding, 5: data.
const SOURCE_MAP_COMMENT_REGEX =
  // eslint-disable-next-line no-useless-escape
  /^\s*?\/[\/\*][@#]\s+?sourceMappingURL=data:(((?:application|text)\/json)(?:;charset=([^;,]+?)?)?)?(?:;(base64))?,(.*?)$/gm;

function isValidSourceMapData(encoding: string, data: string): boolean {
  // Remove any spaces and the trailing `*/`.
  data = data.replace(/\s/g, '').replace('*/', '');

  if (encoding !== 'base64') {
    // Unknown encoding. I think the comment is short (e.g. URL) if it's not
    // base64 encoded, so let's keep it to be safe.
    return false;
  }

  // If it's an invalid base64 string, it must be a sourceMappingURL
  // inside a template literal like the follwoing.
  // https://github.com/webpack-contrib/style-loader/blob/16e401b17a39544d5c8ca47c9032f02e2b60d8f5/src/runtime/styleDomAPI.js#L35C1-L40C1
  return /^[a-zA-Z0-9+=/]+$/.test(data);
}

/*
 * Removes sourceMappingURL comments from a string.
 */
export function removeInlinedSourceMap(source: string): string {
  for (const m of source.matchAll(SOURCE_MAP_COMMENT_REGEX)) {
    // Check if it's certainly a sourceMappingURL in a comment, not a part
    // of JavaScript code (e.g. template literal).
    if (!isValidSourceMapData(m[4], m[5])) {
      continue;
    }

    source = source.replace(m[0], '');
  }

  return source;
}
