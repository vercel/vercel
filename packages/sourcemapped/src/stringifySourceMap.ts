import type { RawSourceMap } from 'source-map';
import convertSourceMap from 'convert-source-map';

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
