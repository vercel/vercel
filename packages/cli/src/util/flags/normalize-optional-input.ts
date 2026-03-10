export function normalizeOptionalInput(
  input: string | undefined
): string | undefined {
  const value = input?.trim();
  return value ? value : undefined;
}
