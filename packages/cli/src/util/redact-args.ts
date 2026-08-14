const SENSITIVE_AUTH_FLAG_NAMES = new Set(['--token', '-t']);

/**
 * Normalizes a flag token to just its flag name (e.g. "--token=abc" -> "--token").
 */
export function normalizeFlagName(flag: string): string {
  if (flag.includes('=')) {
    return flag.slice(0, flag.indexOf('='));
  }
  return flag;
}

/**
 * Removes sensitive auth flags and their values from argv-like lists.
 *
 * Note: `--token`/`-t` are String flags and always consume the next argv token
 * when passed without "=", even if that token starts with "-".
 */
export function stripSensitiveAuthArgs(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const name = normalizeFlagName(arg);
    if (SENSITIVE_AUTH_FLAG_NAMES.has(name)) {
      if (!arg.includes('=') && i + 1 < args.length) {
        i++;
      }
      continue;
    }
    out.push(arg);
  }
  return out;
}
