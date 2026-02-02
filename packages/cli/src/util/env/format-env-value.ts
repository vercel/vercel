export function formatEnvValue(value: string | undefined): string {
  if (value == null) return '';

  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null) {
      return value.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    }
  } catch {
    // Not valid JSON, continue with normal formatting
  }

  const needsQuotes =
    /\s/.test(value) ||
    value.startsWith('#') ||
    value.startsWith('"') ||
    value.startsWith("'");

  if (!needsQuotes) return value;

  const escaped = value
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/"/g, '\\"');
  return `"${escaped}"`;
}
