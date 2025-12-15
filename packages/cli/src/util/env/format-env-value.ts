export function formatEnvValue(value: string | undefined): string {
  if (value == null) return '';

  // Check if value is a valid JSON object/array
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null) {
      // JSON objects/arrays are self-delimiting, so we just need to
      // escape newlines (to keep .env file line-based) without quoting
      // or escaping inner quotes. This prevents double-escaping when
      // bundlers inline values during build.
      return value.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    }
  } catch {
    // Not valid JSON, continue with normal formatting
  }

  const needsQuotes =
    /\s/.test(value) || value.startsWith('#') || value.startsWith('"');

  if (!needsQuotes) return value;

  const escaped = value
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/"/g, '\\"');
  return `"${escaped}"`;
}
