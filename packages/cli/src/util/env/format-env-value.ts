export function formatEnvValue(value: string | undefined): string {
  if (value == null) return '';

  const normalized = value.replace(/\n/g, '\\n').replace(/\r/g, '\\r');

  // Add quotes if the value contains spaces or starts with a # (ie. looks like a comment)
  const needsQuotes = /\s/.test(normalized) || normalized.startsWith('#');

  if (!needsQuotes) return normalized;

  // Escape double quotes
  const escaped = normalized.replace(/"/g, '\\"');
  return `"${escaped}"`;
}
