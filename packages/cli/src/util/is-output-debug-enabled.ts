export default function isOutputDebugEnabled(
  debugFlag: boolean | undefined
): boolean {
  return debugFlag === true || process.env.VERCEL_CLI_DEBUG === '1';
}
