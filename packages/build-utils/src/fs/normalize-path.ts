const isWin = process.platform === 'win32';

/**
 * Convert Windows separators to Unix separators.
 */
export function normalizePath(p: string): string {
  return isWin ? p.replace(/\\/g, '/') : p;
}
