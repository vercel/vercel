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
 * Handles the documented --json flag and the supported --format compatibility
 * path.
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

function isJsonFormatValue(value: string | undefined): boolean {
  return value?.toLowerCase() === 'json';
}

/**
 * Matches `-F` alone or at the end of a group of short flags (e.g. `-dF`),
 * which is where `arg` lets a value-taking short flag read the next argument.
 */
const SHORT_FORMAT_FLAG = /^-[A-Za-z]*F$/;

/**
 * Scans raw argv for every spelling of the JSON output flags that the `arg`
 * parser accepts: `--json`, `--json=<any>`, `--format json`, `--format=json`,
 * and `-F json`. Arguments after `--` are positional and are ignored.
 */
function argvRequestsJson(argv: readonly string[]): boolean {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--') {
      return false;
    }

    // `arg` treats `--json=<anything>` as `--json` for Boolean flags.
    if (arg === '--json' || arg.startsWith('--json=')) {
      return true;
    }

    if (arg.startsWith('--format=')) {
      if (isJsonFormatValue(arg.slice('--format='.length))) {
        return true;
      }
      continue;
    }

    if (arg === '--format' || SHORT_FORMAT_FLAG.test(arg)) {
      if (isJsonFormatValue(argv[i + 1])) {
        return true;
      }
    }
  }

  return false;
}

/** True when stdout is expected to be machine-parsed (suppress human chrome). */
export function wantsMachineReadableOutput(
  subcommand: string | undefined,
  argv: readonly string[]
): boolean {
  if (argv.includes('--help') || argv.includes('-h')) {
    return false;
  }

  if (subcommand === 'api') {
    return true;
  }

  return argvRequestsJson(argv);
}

export function shouldPrintVersionBanner(
  subcommand: string | undefined,
  argv: readonly string[]
): boolean {
  return !wantsMachineReadableOutput(subcommand, argv);
}
