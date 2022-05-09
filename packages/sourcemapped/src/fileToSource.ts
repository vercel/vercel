import type { RawSourceMap } from 'source-map';
import convertSourceMap from 'convert-source-map';
import type { Source } from 'webpack-sources';
import { OriginalSource, SourceMapSource } from 'webpack-sources';
import { promises as fs, constants as fsConstants } from 'fs';

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
    if (fullFilePath && (await pathExists(`${fullFilePath}.map`))) {
      const mapJson = await fs.readFile(`${fullFilePath}.map`, 'utf8');
      return convertSourceMap.fromJSON(mapJson).toObject();
    }
    return convertSourceMap.fromComment(content).toObject();
  } catch {
    return null;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}
