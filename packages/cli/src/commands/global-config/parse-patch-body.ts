/**
 * Parse `--patch` JSON. Shells (notably pnpm) sometimes pass literal two-character
 * `\n` / `\r\n` / `\t` sequences instead of whitespace; strict JSON.parse rejects those.
 */
function parsePatchJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch (firstError) {
    const normalized = trimmed
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t');
    if (normalized === trimmed) {
      throw firstError;
    }
    try {
      return JSON.parse(normalized);
    } catch {
      throw firstError;
    }
  }
}

export function parsePatchBody(raw: string): { items: unknown[] } {
  const parsed = parsePatchJson(raw) as unknown;
  if (Array.isArray(parsed)) {
    return { items: parsed };
  }
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'items' in parsed &&
    Array.isArray((parsed as { items: unknown }).items)
  ) {
    return { items: (parsed as { items: unknown[] }).items };
  }
  throw new Error(
    '`--patch` must be a JSON array of item operations or an object `{ "items": [...] }`.'
  );
}
