import { randomBytes } from 'node:crypto';
import type { FlagKind, FlagVariant, FlagVariantValue } from './types';

type VariantInputKind = Exclude<FlagKind, 'boolean'>;

const VARIANT_ID_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function generateVariantId(size = 21): string {
  const bytes = randomBytes(size);
  let id = '';

  for (let index = 0; index < size; index++) {
    id += VARIANT_ID_ALPHABET[bytes[index] % VARIANT_ID_ALPHABET.length];
  }

  return id;
}

export function parseVariantInput(
  input: string,
  kind: VariantInputKind,
  index: number
): FlagVariant {
  const { rawValue, rawLabel } = splitVariantInput(input, kind);

  const validationError = validateVariantValue(rawValue, kind);
  if (validationError) {
    throw new Error(`Invalid variant "${input}": ${validationError}`);
  }

  return {
    id: generateVariantId(),
    value: parseVariantValue(rawValue, kind),
    label: getVariantLabel(rawLabel, kind, index),
    description: '',
  };
}

export function validateVariantValue(
  value: string,
  kind: FlagKind
): string | null {
  if (!value.trim()) {
    return 'Variant value cannot be empty';
  }

  if (kind === 'boolean') {
    const loweredValue = value.toLowerCase();
    if (loweredValue !== 'true' && loweredValue !== 'false') {
      return 'Boolean variant values must be true or false';
    }
  }

  if (kind === 'number') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 'Number variants must be valid numeric values';
    }
  }

  if (kind === 'json' && !isValidJsonVariantValue(value)) {
    return 'JSON variant values must be valid JSON';
  }

  return null;
}

function splitVariantInput(
  input: string,
  kind: VariantInputKind
): { rawValue: string; rawLabel?: string } {
  if (kind !== 'json') {
    const separatorIndex = input.indexOf('=');
    return {
      rawValue:
        separatorIndex === -1
          ? input.trim()
          : input.slice(0, separatorIndex).trim(),
      rawLabel:
        separatorIndex === -1
          ? undefined
          : input.slice(separatorIndex + 1).trim() || undefined,
    };
  }

  const trimmed = input.trim();
  if (isValidJsonVariantValue(trimmed)) {
    return { rawValue: trimmed };
  }

  for (let index = trimmed.length - 1; index >= 0; index--) {
    if (trimmed[index] !== '=') {
      continue;
    }

    const rawValue = trimmed.slice(0, index).trim();
    const rawLabel = trimmed.slice(index + 1).trim();
    if (!rawValue || !isValidJsonVariantValue(rawValue)) {
      continue;
    }

    return {
      rawValue,
      rawLabel: rawLabel || undefined,
    };
  }

  return { rawValue: trimmed };
}

function getVariantLabel(
  rawLabel: string | undefined,
  kind: VariantInputKind,
  index: number
): string | undefined {
  if (rawLabel) {
    return rawLabel;
  }

  if (kind === 'json') {
    return `Variant ${index + 1}`;
  }

  return undefined;
}

function parseVariantValue(
  value: string,
  kind: VariantInputKind
): FlagVariantValue {
  if (kind === 'number') {
    return Number(value);
  }

  if (kind === 'json') {
    return JSON.parse(value) as FlagVariantValue;
  }

  return value;
}

function isValidJsonVariantValue(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}
