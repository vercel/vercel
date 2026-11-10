const SENSITIVE_AUTH_FLAG_NAMES = new Set(['--token', '-t']);

/** Matches a Vercel Flags SDK key such as `vf_server_…`. */
export const SDK_KEY_PATTERN = /^vf_(?:server|client)_/;

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
 *
 * `-t` can also sit in a group of short flags, as in `-dt <token>`, where the
 * parser still reads the next argv token as the token. The group keeps its
 * other flags (`-d`) and loses the `t` and the token. Groups after `--` belong
 * to a child command and are kept as they are.
 *
 * `--sdk-key` takes no value, so a value attached to it (`--sdk-key=<key>`) and
 * any argument that looks like an SDK key are dropped as well.
 */
export function stripSensitiveAuthArgs(args: string[]): string[] {
  const out: string[] = [];
  let afterDelimiter = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') {
      afterDelimiter = true;
    }
    if (
      !afterDelimiter &&
      (arg.startsWith('--sdk-key=') || SDK_KEY_PATTERN.test(arg))
    ) {
      continue;
    }
    const name = normalizeFlagName(arg);
    if (SENSITIVE_AUTH_FLAG_NAMES.has(name)) {
      if (!arg.includes('=') && i + 1 < args.length) {
        i++;
      }
      continue;
    }
    if (!afterDelimiter && /^-[A-Za-z]{2,}$/.test(arg) && arg.includes('t')) {
      const rest = arg.replace(/t/g, '');
      if (rest !== '-') {
        out.push(rest);
      }
      if (i + 1 < args.length) {
        i++;
      }
      continue;
    }
    out.push(arg);
  }
  return out;
}
