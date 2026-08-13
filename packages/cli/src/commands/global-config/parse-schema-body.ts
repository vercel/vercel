/**
 * Parse the JSON for `global-config schema set`. The input is a JSON Schema
 * document read from a file or stdin.
 *
 * Accepts either the bare schema definition or a `{ "definition": <schema> }`
 * wrapper so that the output of `global-config schema get` round-trips back
 * into `set`. The API body is always `{ definition: <schema> }`.
 */
export function parseSchemaBody(raw: string): { definition: unknown } {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(
      'No schema provided. Pass a file path or pipe JSON via stdin.'
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(
      `Schema must be valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    'definition' in parsed
  ) {
    return { definition: (parsed as { definition: unknown }).definition };
  }

  return { definition: parsed };
}
