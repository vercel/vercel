export function parseBooleanEnv(
  value: string | undefined
): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

/**
 * Resolve non-interactive mode globally.
 *
 * Priority:
 * 1) VERCEL_NON_INTERACTIVE env var when set to a supported boolean-like value.
 * 2) Agent fallback for non-TTY sessions.
 */
export function resolveNonInteractive(opts: {
  envValue: string | undefined;
  cliFlag: boolean;
  explicitCliFalse: boolean;
  isAgent: boolean;
  stdinIsTTY: boolean;
}): { nonInteractive: boolean; fromEnv: boolean; parsedEnv?: boolean } {
  const parsedEnv = parseBooleanEnv(opts.envValue);
  if (parsedEnv !== undefined) {
    return { nonInteractive: parsedEnv, fromEnv: true, parsedEnv };
  }

  const fallback = opts.isAgent && !opts.stdinIsTTY;
  const nonInteractive = opts.explicitCliFalse
    ? false
    : opts.cliFlag || fallback;

  return {
    nonInteractive,
    fromEnv: false,
    parsedEnv: undefined,
  };
}
