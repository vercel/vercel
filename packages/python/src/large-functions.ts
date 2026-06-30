/**
 * Whether large functions are enabled (via `VERCEL_SUPPORT_LARGE_FUNCTIONS`).
 * When enabled, functions exceeding the AWS Lambda size limits run on Hive.
 */
export function isLargeFunctionsEnabled(): boolean {
  const value = process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS;
  return value === '1' || value === 'true';
}
