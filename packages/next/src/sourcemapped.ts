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
  const cleanContent = convertSourceMap.removeComments(content);
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
