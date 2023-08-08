/**
 * Redacts `--env`, `--build-env`, and `--token` in `argv`.
 */
export function scrubArgv(argv: string[]) {
  const clonedArgv = [...argv];
  const tokenRE = /^(-[A-Za-z]*[bet]|--(?:build-env|env|token))(=.*)?$/;

  for (let i = 0, len = clonedArgv.length; i < len; i++) {
    const m = clonedArgv[i].match(tokenRE);

    if (m?.[2]) {
      clonedArgv[i] = `${m[1]}=REDACTED`;
    } else if (m && i + 1 < len) {
      clonedArgv[++i] = 'REDACTED';
    }
  }

  return clonedArgv;
}
