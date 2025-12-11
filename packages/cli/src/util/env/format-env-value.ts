export function formatEnvValue(value: string | undefined): string {
  if (value == null) return '';

  // JSON objects/arrays are self-delimiting, safe to leave unquoted
  // Skip if value contains newlines (would span multiple lines in .env file)
  if (!/[\r\n]/.test(value)) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'object' && parsed !== null) {
        return value;
      }
    } catch {
      // Not valid JSON, continue with normal formatting
    }
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
