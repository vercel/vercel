import type { Source } from 'webpack-sources';
import { ConcatSource, OriginalSource } from 'webpack-sources';

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
