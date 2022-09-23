import type { RawSourceMap } from 'source-map';
import type { Source } from 'webpack-sources';
import convertSourceMap from 'convert-source-map';
import fs from 'fs-extra';
import { ConcatSource, OriginalSource, SourceMapSource } from 'webpack-sources';

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
  content: string | Buffer,
  sourceName: string,
  fullFilePath?: string,
  options?: Partial<{
    /**
     * Passing a custom `readFile` function allows to use a custom file system,
     * like we do in `./esbuild-file-system-plugin.ts`, which reads all data from an
     * in-memory data structure, and not a real file system.
     *
     * When not provided, the default `fs.readFile` will be used.
     */
    readFile(path: string): Promise<Buffer>;
  }>
): Promise<Source> {
  const stringContent = content.toString('utf8');
  const sourcemap = await getSourceMap(stringContent, {
    readFile: options?.readFile ?? fs.readFile,
    fullFilePath,
  });
  const cleanContent = convertSourceMap.removeComments(stringContent);
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
  options: { fullFilePath?: string; readFile(path: string): Promise<Buffer> }
): Promise<RawSourceMap | null> {
  try {
    if (options.fullFilePath) {
      const mapPath = `${options.fullFilePath}.map`;
      const jsonBuffer = await options.readFile(mapPath);
      const mapJson = jsonBuffer.toString('utf8');
      return convertSourceMap.fromJSON(mapJson).toObject();
    }
    return convertSourceMap.fromComment(content).toObject();
  } catch {
    return null;
  }
}
