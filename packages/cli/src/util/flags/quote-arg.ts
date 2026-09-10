// Wrap a value in single quotes only when it contains characters the shell
// would otherwise interpret, so printed next-page commands stay copy-pasteable.
export function quoteArg(value: string): string {
  if (/^[A-Za-z0-9_./@:-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
