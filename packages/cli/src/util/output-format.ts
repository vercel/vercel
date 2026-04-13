/**
 * Supported output formats for CLI commands.
 * Currently only 'json' is supported, but this is designed for future extensibility.
 */
export type OutputFormat = 'json';

export const OUTPUT_FORMATS: readonly OutputFormat[] = ['json'] as const;

/**
 * Parses and validates the output format string.
 * Returns the format if valid, throws an error if invalid.
 */
export function parseOutputFormat(value: string): OutputFormat {
  const normalized = value.toLowerCase();
  if (OUTPUT_FORMATS.includes(normalized as OutputFormat)) {
    return normalized as OutputFormat;
  }
  throw new Error(
    `Invalid output format: "${value}". Valid formats: ${OUTPUT_FORMATS.join(', ')}`
  );
}

/**
 * Determines the output format from parsed CLI flags.
 * Handles both --format and deprecated --json flags.
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
    return parseOutputFormat(formatFlag);
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
  try {
    const jsonOutput = isJsonOutput(flags);
    return { valid: true, jsonOutput };
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}
