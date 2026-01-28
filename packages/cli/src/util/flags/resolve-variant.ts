import type { FlagVariant } from './types';

export interface ResolveVariantResult {
  variant: FlagVariant | null;
  error: string | null;
}

/**
 * Formats a variant for display in error messages and prompts.
 * Shows the ID, value, and label if available.
 */
export function formatVariantForDisplay(variant: FlagVariant): string {
  const parts = [variant.id];
  parts.push(`value: ${JSON.stringify(variant.value)}`);
  if (variant.label) {
    parts.push(`label: "${variant.label}"`);
  }
  return parts.join(', ');
}

/**
 * Formats a list of variants for error messages.
 */
export function formatAvailableVariants(variants: FlagVariant[]): string {
  return variants
    .map(v => {
      const label = v.label ? ` (${v.label})` : '';
      return `  - ${JSON.stringify(v.value)}${label}`;
    })
    .join('\n');
}

/**
 * Resolves a user-provided variant input to an actual variant.
 *
 * Resolution order:
 * 1. Exact match on variant ID
 * 2. Match on variant value (supports true/false, "on"/"off", string values, etc.)
 * 3. Case-insensitive match on variant label
 *
 * @param input - The user-provided variant identifier (ID, value, or label)
 * @param variants - The available variants for the flag
 * @returns The resolved variant or null with an error message
 */
export function resolveVariant(
  input: string,
  variants: FlagVariant[]
): ResolveVariantResult {
  // 1. Try exact match on variant ID
  const byId = variants.find(v => v.id === input);
  if (byId) {
    return { variant: byId, error: null };
  }

  // 2. Try to match by value
  // First try exact string match (for string variants with values like "off")
  const byExactValue = variants.find(v => v.value === input);
  if (byExactValue) {
    return { variant: byExactValue, error: null };
  }

  // Then try parsed value (handles "true"/"false"/"on"/"off" for boolean flags)
  const parsedInput = parseVariantValue(input);
  const byValue = variants.find(v => valuesMatch(v.value, parsedInput));
  if (byValue) {
    return { variant: byValue, error: null };
  }

  // 3. Try case-insensitive match on label
  const inputLower = input.toLowerCase();
  const byLabel = variants.find(v => v.label?.toLowerCase() === inputLower);
  if (byLabel) {
    return { variant: byLabel, error: null };
  }

  // No match found - return helpful error
  const availableList = formatAvailableVariants(variants);
  const error = `Variant "${input}" not found.\n\nAvailable variants:\n${availableList}\n\nYou can specify a variant by its value (e.g., "true", "false") or label.`;

  return { variant: null, error };
}

/**
 * Parses a string input into the appropriate type for comparison.
 * Handles booleans, numbers, and strings.
 */
function parseVariantValue(input: string): string | number | boolean {
  // Handle boolean values (only true/false, not on/off to avoid ambiguity with string values)
  const lowerInput = input.toLowerCase();
  if (lowerInput === 'true') {
    return true;
  }
  if (lowerInput === 'false') {
    return false;
  }

  // Handle numeric values
  const num = Number(input);
  if (!isNaN(num) && input.trim() !== '') {
    return num;
  }

  // Return as string
  return input;
}

/**
 * Compares two variant values for equality.
 * Handles type coercion for common cases.
 */
function valuesMatch(
  variantValue: string | number | boolean,
  inputValue: string | number | boolean
): boolean {
  // Direct equality
  if (variantValue === inputValue) {
    return true;
  }

  // String comparison of values (for cases like "off" matching string "off")
  if (String(variantValue) === String(inputValue)) {
    return true;
  }

  return false;
}
