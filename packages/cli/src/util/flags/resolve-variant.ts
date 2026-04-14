import chalk from 'chalk';
import deepEqual from 'fast-deep-equal';
import type { FlagVariant } from './types';

export interface ResolveVariantResult {
  variant: FlagVariant | null;
  error: string | null;
}

/**
 * Formats a variant value for display.
 */
export function formatVariantValue(value: FlagVariant['value']): string {
  return JSON.stringify(value);
}

/**
 * Formats a variant for display in prompts and messages.
 * Shows the value first, followed by the label if available.
 */
export function formatVariantForDisplay(variant: FlagVariant): string {
  const parts = [formatVariantValue(variant.value)];
  if (variant.label) {
    parts.push(chalk.dim(variant.label));
  }
  return parts.join(' ');
}

/**
 * Formats a list of variants for error messages.
 */
export function formatAvailableVariants(variants: FlagVariant[]): string {
  return variants.map(v => `  - ${formatAvailableVariant(v)}`).join('\n');
}

/**
 * Resolves a user-provided variant input to an actual variant.
 *
 * Resolution order:
 * 1. Exact match on variant ID
 * 2. Match on variant value (supports booleans, strings, numbers, and JSON)
 *
 * Labels are intentionally excluded because they are presentation-oriented and
 * may not be unique across variants.
 *
 * @param input - The user-provided variant identifier (ID or value)
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

  // 2. Try to match by parsed value so JSON-kind flags can resolve objects,
  // arrays, null, and other JSON literals by value.
  const parsedInput = parseVariantValue(input);
  const byValue = variants.find(v => valuesMatch(v.value, parsedInput));
  if (byValue) {
    return { variant: byValue, error: null };
  }

  // 3. Fall back to an exact string match so string variants like "true" or
  // "020" still resolve naturally when no parsed-value match exists.
  const byExactStringValue = variants.find(v => v.value === input);
  if (byExactStringValue) {
    return { variant: byExactStringValue, error: null };
  }

  // No match found - return helpful error
  const availableList = formatAvailableVariants(variants);
  const error = `Variant "${input}" not found.\n\nAvailable variants:\n${availableList}\n\nYou can specify a variant by its ID or value.`;

  return { variant: null, error };
}

/**
 * Parses a string input into the appropriate type for comparison.
 * Handles JSON literals first, then falls back to the raw string input.
 */
function parseVariantValue(input: string): FlagVariant['value'] {
  const trimmed = input.trim();
  if (!trimmed) {
    return input;
  }

  try {
    return JSON.parse(trimmed) as FlagVariant['value'];
  } catch {
    const lowerInput = trimmed.toLowerCase();
    if (lowerInput === 'true') {
      return true;
    }
    if (lowerInput === 'false') {
      return false;
    }

    const parsedNumber = Number(trimmed);
    if (!Number.isNaN(parsedNumber)) {
      return parsedNumber;
    }

    return input;
  }
}

/**
 * Compares two variant values for equality.
 */
function valuesMatch(
  variantValue: FlagVariant['value'],
  inputValue: FlagVariant['value']
): boolean {
  return deepEqual(variantValue, inputValue);
}

function formatAvailableVariant(variant: FlagVariant): string {
  const value = formatStyledVariantValue(variant.value);
  if (!variant.label) {
    return value;
  }

  return `${value} ${chalk.dim(variant.label)}`;
}

function formatStyledVariantValue(value: FlagVariant['value']): string {
  const formattedValue = formatVariantValue(value);
  if (typeof value !== 'string') {
    return chalk.bold(formattedValue);
  }

  return `"${chalk.bold(formattedValue.slice(1, -1))}"`;
}
