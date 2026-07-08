/**
 * Supported output formats for CLI commands.
 *
 * `json` and `table` are real, rendered formats today. The type is derived from
 * `ALL_OUTPUT_FORMATS` so adding a new format (e.g. `yaml`) is a one-line change
 * plus a renderer.
 */
export const ALL_OUTPUT_FORMATS = ['json', 'table'] as const;

export type OutputFormat = (typeof ALL_OUTPUT_FORMATS)[number];

export const OUTPUT_FORMATS: readonly OutputFormat[] = ALL_OUTPUT_FORMATS;

/**
 * Parses and validates an output format string against the supported set.
 * Returns the format if valid, throws an error if invalid.
 *
 * @param value - The raw `--format` value
 * @param supported - The formats the command declares support for (defaults to all)
 */
export function parseOutputFormat(
  value: string,
  supported: readonly OutputFormat[] = ALL_OUTPUT_FORMATS
): OutputFormat {
  const normalized = value.toLowerCase();
  if (supported.includes(normalized as OutputFormat)) {
    return normalized as OutputFormat;
  }
  throw new Error(
    `Invalid output format: "${value}". Valid formats: ${supported.join(', ')}`
  );
}

/**
 * Determines the output format from parsed CLI flags.
 * Handles both --format and the deprecated --json flag.
 *
 * @param flags - Parsed CLI flags object
 * @returns The output format if specified, undefined for default human output
 */
export function getOutputFormat(flags: {
  '--format'?: string;
  '--json'?: boolean;
}): OutputFormat | undefined {
  const formatFlag = flags['--format'];
  const jsonFlag = flags['--json'];

  if (formatFlag) {
    // Legacy accessor: only `json` was ever valid here.
    return parseOutputFormat(formatFlag, ['json']);
  }

  if (jsonFlag) {
    return 'json';
  }

  return undefined;
}

/**
 * Checks if output should be formatted as JSON.
 * Convenience method for the common case.
 */
export function isJsonOutput(flags: {
  '--format'?: string;
  '--json'?: boolean;
}): boolean {
  return getOutputFormat(flags) === 'json';
}

/**
 * Result type for validated output format check.
 */
export type OutputFormatResult =
  | { valid: true; jsonOutput: boolean }
  | { valid: false; error: string };

/**
 * Validates the output format flags and returns either a success result
 * with the jsonOutput boolean, or a failure result with an error message.
 *
 * Use this instead of isJsonOutput when you need proper error handling.
 */
export function validateJsonOutput(flags: {
  '--format'?: string;
  '--json'?: boolean;
}): OutputFormatResult {
  // Legacy accessor: only `json` was ever valid here, so resolve against ['json']
  // to preserve the previous behavior (`--format=table` remains invalid).
  const result = resolveOutputFormat(flags, ['json']);
  if ('error' in result) {
    return { valid: false, error: result.error };
  }
  return { valid: true, jsonOutput: result.format === 'json' };
}

/**
 * Successful resolution: the chosen format, or `undefined` for default human output.
 */
export type ResolvedOutputFormat =
  | { format: OutputFormat | undefined }
  | { error: string };

/**
 * Resolves the chosen output format from either `--format=<fmt>` or a boolean
 * alias (`--json`, `--table`, …), against the command's declared `supported` set.
 *
 * This is the single accessor commands should use: it works identically whether
 * the user passed `--format json` or `--json`.
 *
 * Rules:
 * - No format flag → `{ format: undefined }` (default human output).
 * - `--format=X` with an unsupported `X` → error.
 * - A boolean alias the command didn't declare is not registered as a flag, so it
 *   won't reach here; if one does, it's treated as unsupported → error.
 * - Requesting the *same* format two ways (`--format=json --json`) is allowed.
 * - Requesting *different* formats (`--json --table`, `--format=table --json`) → error.
 */
export function resolveOutputFormat(
  flags: Record<string, unknown>,
  supported: readonly OutputFormat[] = ALL_OUTPUT_FORMATS
): ResolvedOutputFormat {
  const requested = new Set<OutputFormat>();

  const formatFlag = flags['--format'];
  if (typeof formatFlag === 'string' && formatFlag.length > 0) {
    const normalized = formatFlag.toLowerCase();
    if (!supported.includes(normalized as OutputFormat)) {
      return {
        error: `Invalid output format: "${formatFlag}". Valid formats: ${supported.join(', ')}`,
      };
    }
    requested.add(normalized as OutputFormat);
  }

  // Boolean aliases: --json, --table, etc. Only aliases within `supported` are
  // considered (others are never registered as flags for the command).
  for (const format of supported) {
    if (flags[`--${format}`] === true) {
      requested.add(format);
    }
  }

  if (requested.size === 0) {
    return { format: undefined };
  }

  if (requested.size > 1) {
    const labels = describeRequestedFormats(flags, supported);
    return {
      error: `Conflicting output formats: ${labels.join(' and ')}. Specify only one.`,
    };
  }

  const [format] = requested;
  return { format };
}

/**
 * Builds human-readable flag labels for a conflict error, e.g.
 * `--format=table` and `--json`, in the order they were provided.
 */
function describeRequestedFormats(
  flags: Record<string, unknown>,
  supported: readonly OutputFormat[]
): string[] {
  const labels: string[] = [];
  const formatFlag = flags['--format'];
  if (typeof formatFlag === 'string' && formatFlag.length > 0) {
    labels.push(`--format=${formatFlag.toLowerCase()}`);
  }
  for (const format of supported) {
    if (flags[`--${format}`] === true) {
      labels.push(`--${format}`);
    }
  }
  return labels;
}
