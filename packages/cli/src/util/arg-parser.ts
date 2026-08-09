import { parseArgs } from 'node:util';

/**
 * A minimal argument parser built on top of Node's built-in `util.parseArgs`.
 *
 * It intentionally keeps the same specification format, return shape and error
 * messages that the CLI relied on before, so that commands don't need to know
 * which parser is used underneath:
 *
 * ```ts
 * parse({ '--force': Boolean, '-f': '--force', '--tag': [String] }, { argv });
 * // => { _: [...positionals], '--force': true, '--tag': ['a', 'b'] }
 * ```
 *
 * `util.parseArgs` is used to tokenize `argv` (it handles `--flag=value`,
 * short flag groups such as `-ab`, and the `--` terminator). The tokens are
 * then folded into the result using the types declared in the specification,
 * which is what adds support for `Number`, repeatable (`[Type]`) options and
 * aliases.
 */

export type Handler<T = any> = (
  value: string,
  name: string,
  previousValue?: T
) => T;

export interface Spec {
  [key: string]: string | Handler | [Handler];
}

export type Result<T extends Spec> = { _: string[] } & {
  [K in keyof T]?: T[K] extends Handler
    ? ReturnType<T[K]>
    : T[K] extends [Handler]
      ? Array<ReturnType<T[K][0]>>
      : never;
};

export interface Options {
  argv?: string[];
  /**
   * Push unknown options into `_` instead of throwing.
   */
  permissive?: boolean;
}

export class ArgError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ArgError';
    this.code = code;

    Object.setPrototypeOf(this, ArgError.prototype);
  }
}

/**
 * Matches values that may be passed to a `Number` option even though they look
 * like an option, e.g. `--limit -1`.
 */
const NUMERIC_VALUE = /^-?\d*(\.(?=\d))?\d*$/;

interface CompiledOption {
  /** The canonical (long) name of the option, e.g. `--force`. */
  name: string;
  /** Converts the raw value, accumulating it for repeatable options. */
  convert: Handler;
  /** `true` when the option doesn't take a value. */
  isFlag: boolean;
  /** `true` when a value that looks like a negative number is allowed. */
  allowsNumericValue: boolean;
}

interface CompiledSpec {
  /** All options, keyed by their canonical (long) name. */
  options: Map<string, CompiledOption>;
  /** `util.parseArgs` option name (no leading dashes) -> canonical name. */
  names: Map<string, string>;
  /** The configuration handed to `util.parseArgs`. */
  parseArgsOptions: Record<
    string,
    { type: 'string' | 'boolean'; short?: string; multiple: true }
  >;
}

function compileSpec(spec: Spec): CompiledSpec {
  const options = new Map<string, CompiledOption>();
  const aliases = new Map<string, string>();

  for (const key of Object.keys(spec)) {
    if (!key) {
      throw new ArgError(
        'argument key cannot be an empty string',
        'ARG_CONFIG_EMPTY_KEY'
      );
    }

    if (key[0] !== '-') {
      throw new ArgError(
        `argument key must start with '-' but found: '${key}'`,
        'ARG_CONFIG_NONOPT_KEY'
      );
    }

    if (key.length === 1) {
      throw new ArgError(
        `argument key must have a name; singular '-' keys are not allowed: ${key}`,
        'ARG_CONFIG_NONAME_KEY'
      );
    }

    if (key[1] !== '-' && key.length > 2) {
      throw new ArgError(
        `short argument keys (with a single hyphen) must have only one character: ${key}`,
        'ARG_CONFIG_SHORTOPT_TOOLONG'
      );
    }

    const value = spec[key];

    if (typeof value === 'string') {
      aliases.set(key, value);
      continue;
    }

    if (Array.isArray(value) && value.length === 1 && value[0] === Boolean) {
      options.set(key, {
        name: key,
        convert: (raw, name, previous: unknown[] = []) => {
          previous.push(Boolean(raw));
          return previous;
        },
        isFlag: true,
        allowsNumericValue: false,
      });
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length === 1 &&
      typeof value[0] === 'function'
    ) {
      const [type] = value;
      options.set(key, {
        name: key,
        convert: (raw, name, previous: unknown[] = []) => {
          previous.push(type(raw, name, previous[previous.length - 1]));
          return previous;
        },
        isFlag: false,
        allowsNumericValue: false,
      });
      continue;
    }

    if (typeof value !== 'function') {
      throw new ArgError(
        `type missing or not a function or valid array type: ${key}`,
        'ARG_CONFIG_VAD_TYPE'
      );
    }

    options.set(key, {
      name: key,
      convert: value,
      isFlag: value === Boolean,
      allowsNumericValue: value === Number || value === BigInt,
    });
  }

  const names = new Map<string, string>();
  const parseArgsOptions: CompiledSpec['parseArgsOptions'] =
    Object.create(null);

  for (const option of options.values()) {
    const key = option.name.slice(2);
    names.set(key, option.name);
    parseArgsOptions[key] = {
      type: option.isFlag ? 'boolean' : 'string',
      multiple: true,
    };
  }

  for (const [alias, target] of aliases) {
    // Aliases may point at other aliases, e.g. `-c` -> `-y` -> `--yes`
    let name = target;
    const seen = new Set<string>([alias]);
    while (aliases.has(name) && !seen.has(name)) {
      seen.add(name);
      name = aliases.get(name) as string;
    }

    const option = options.get(name);
    if (!option) {
      // Matches the behavior of dangling aliases: the option is unknown
      continue;
    }

    const type = option.isFlag ? 'boolean' : 'string';

    if (alias.startsWith('--')) {
      const key = alias.slice(2);
      names.set(key, option.name);
      parseArgsOptions[key] = { type, multiple: true };
      continue;
    }

    const short = alias.slice(1);
    const canonicalKey = option.name.slice(2);
    if (parseArgsOptions[canonicalKey].short === undefined) {
      parseArgsOptions[canonicalKey].short = short;
      continue;
    }

    // `util.parseArgs` supports a single short flag per option, so additional
    // aliases are registered under a synthetic name. `#` can't appear in an
    // option typed by the user, so it can never be reached as a long flag.
    const key = `${canonicalKey}#${short}`;
    names.set(key, option.name);
    parseArgsOptions[key] = { type, short, multiple: true };
  }

  return { options, names, parseArgsOptions };
}

/**
 * The raw text of an option token, used when reporting unknown options in
 * permissive mode. Short flag groups are reported one flag at a time.
 */
function rawOption(rawName: string, value: string | undefined): string {
  return rawName.startsWith('--') && value !== undefined
    ? `${rawName}=${value}`
    : rawName;
}

export default function parse<T extends Spec>(
  spec: T,
  { argv = process.argv.slice(2), permissive = false }: Options = {}
): Result<T> {
  if (!spec) {
    throw new ArgError(
      'argument specification object is required',
      'ARG_CONFIG_NO_SPEC'
    );
  }

  const { options, names, parseArgsOptions } = compileSpec(spec);

  const { tokens } = parseArgs({
    args: argv,
    options: parseArgsOptions,
    // Unknown options and repeated values are handled below so that the error
    // messages stay consistent and `permissive` can be honored.
    strict: false,
    allowPositionals: true,
    tokens: true,
  });

  const result: { _: string[]; [key: string]: any } = { _: [] };

  for (const token of tokens) {
    if (token.kind === 'option-terminator') {
      // Everything after `--` is a positional argument
      result._.push(...argv.slice(token.index + 1));
      break;
    }

    if (token.kind === 'positional') {
      result._.push(token.value);
      continue;
    }

    const name = names.get(token.name);
    const option = name ? options.get(name) : undefined;

    if (!option) {
      if (permissive) {
        result._.push(rawOption(token.rawName, token.value));
        continue;
      }

      throw new ArgError(
        `unknown or unexpected option: ${token.rawName}`,
        'ARG_UNKNOWN_OPTION'
      );
    }

    if (option.isFlag) {
      result[option.name] = option.convert(
        true as unknown as string,
        option.name,
        result[option.name]
      );
      continue;
    }

    const inGroup =
      !token.rawName.startsWith('--') && argv[token.index].length > 2;
    if (inGroup && token.inlineValue) {
      throw new ArgError(
        `option requires argument (but was followed by another short argument): ${token.rawName}`,
        'ARG_MISSING_REQUIRED_SHORTARG'
      );
    }

    // A value that looks like another option is not consumed, so that
    // `vc deploy --meta --prod` reports the missing value instead of
    // silently using `--prod` as the value of `--meta`.
    const looksLikeOption =
      !token.inlineValue &&
      token.value !== undefined &&
      token.value.length > 1 &&
      token.value.startsWith('-') &&
      !(option.allowsNumericValue && NUMERIC_VALUE.test(token.value));

    if (token.value === undefined || looksLikeOption) {
      const extended =
        token.rawName === option.name ? '' : ` (alias for ${option.name})`;
      throw new ArgError(
        `option requires argument: ${token.rawName}${extended}`,
        'ARG_MISSING_REQUIRED_LONGARG'
      );
    }

    result[option.name] = option.convert(
      token.value,
      option.name,
      result[option.name]
    );
  }

  return result as Result<T>;
}
