import type { FlagVariantValue } from './types';

const DEFAULT_JSON_PREVIEW_MAX_LENGTH = 120;

export const JSON_SHELL_HINT =
  'Wrap JSON values in single quotes so your shell passes them as one argument.';

export interface ParsedJsonFlagInput {
  ok: true;
  raw: string;
  value: FlagVariantValue;
  preview: string;
}

export interface InvalidJsonFlagInput {
  ok: false;
  raw: string;
  preview: string;
  parseErrorMessage: string;
  looksLikeJson: boolean;
}

export type JsonFlagInputResult = ParsedJsonFlagInput | InvalidJsonFlagInput;

export function formatJsonValuePreview(
  value: FlagVariantValue,
  maxLength: number = DEFAULT_JSON_PREVIEW_MAX_LENGTH
): string {
  return truncatePreview(JSON.stringify(value), maxLength);
}

export function formatJsonInputPreview(
  input: string,
  maxLength: number = DEFAULT_JSON_PREVIEW_MAX_LENGTH
): string {
  return truncatePreview(normalizePreviewInput(input), maxLength);
}

export function looksLikeJsonFlagInput(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) {
    return false;
  }

  if (
    trimmed.startsWith('{') ||
    trimmed.startsWith('[') ||
    trimmed.startsWith('"')
  ) {
    return true;
  }

  if (trimmed === 'true' || trimmed === 'false' || trimmed === 'null') {
    return true;
  }

  return /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed);
}

export function parseJsonFlagInput(input: string): JsonFlagInputResult {
  const trimmed = input.trim();
  try {
    const value = JSON.parse(trimmed) as FlagVariantValue;
    return {
      ok: true,
      raw: input,
      value,
      preview: formatJsonValuePreview(value),
    };
  } catch (error) {
    return {
      ok: false,
      raw: input,
      preview: formatJsonInputPreview(input),
      parseErrorMessage:
        error instanceof Error ? error.message : 'Invalid JSON value.',
      looksLikeJson: looksLikeJsonFlagInput(input),
    };
  }
}

export function formatInvalidJsonFlagInputMessage(options: {
  argumentName: '--variant' | '--value';
  parseResult: InvalidJsonFlagInput;
  mode: 'create-variant' | 'update-value' | 'variant-selector';
}): string {
  const { argumentName, parseResult, mode } = options;
  const lines = [
    `Invalid JSON for ${argumentName}: ${parseResult.parseErrorMessage}`,
    `Received: ${parseResult.preview}`,
  ];

  if (mode === 'create-variant') {
    lines.push(
      `For json flags, ${argumentName} expects valid JSON before any optional "=LABEL" suffix.`
    );
    lines.push(`Example: ${argumentName} ${getJsonVariantExample(true)}`);
  } else if (mode === 'update-value') {
    lines.push(`Use a valid JSON literal for ${argumentName}.`);
    lines.push(`Example: ${argumentName} ${getJsonVariantExample(false)}`);
  } else {
    lines.push(
      `For json flags, ${argumentName} accepts either a variant ID or an exact JSON value.`
    );
    lines.push(`Example: ${argumentName} ${getJsonVariantExample(false)}`);
  }

  lines.push(JSON_SHELL_HINT);
  return lines.join('\n');
}

export function getJsonVariantExample(includeLabel: boolean): string {
  const example = `'{"theme":"dark","sidebar":true}'`;
  return includeLabel ? `${example}=Dark` : example;
}

function normalizePreviewInput(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

function truncatePreview(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input;
  }

  const headLength = Math.max(1, Math.floor((maxLength - 1) / 2));
  const tailLength = Math.max(1, maxLength - headLength - 1);

  return `${input.slice(0, headLength)}…${input.slice(-tailLength)}`;
}
