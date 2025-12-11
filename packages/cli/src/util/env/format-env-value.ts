export function formatEnvValue(value: string | undefined): string {
  if (value == null) return '';

  const needsQuotes =
    /\s/.test(value) || value.startsWith('#') || value.startsWith('"');

  if (!needsQuotes) return value;

  const escaped = value
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/"/g, '\\"');
  return `"${escaped}"`;
}
