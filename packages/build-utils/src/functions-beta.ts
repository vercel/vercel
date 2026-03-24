export function parseFunctionsBetaOptIns(
  value: string | undefined
): Set<string> {
  if (!value) return new Set();

  return new Set(
    value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  );
}

export function hasFunctionsBetaOptIn(
  env: NodeJS.ProcessEnv,
  optIn: string
): boolean {
  return parseFunctionsBetaOptIns(env.VERCEL_FUNCTIONS_BETA).has(optIn);
}
