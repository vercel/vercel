import { frameworkList } from '@vercel/frameworks';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getMatchingServerOnlyKey, looksLikeSecret } from './secret-detection';

export interface EnvWarning {
  message: string;
  requiresConfirmation: boolean;
}

export function getEnvValueWarnings(value: string): EnvWarning[] {
  const warnings: EnvWarning[] = [];

  // Strip single trailing \n (common in piped input from `echo`) for all checks
  const normalized = value.replace(/\n$/, '');

  if (/^[ \t]+/.test(normalized)) {
    warnings.push({
      message: 'starts with whitespace',
      requiresConfirmation: false,
    });
  }
  if (/[ \t]+$/.test(normalized)) {
    warnings.push({
      message: 'ends with whitespace',
      requiresConfirmation: false,
    });
  }
  if (normalized.includes('\r') || normalized.includes('\n')) {
    warnings.push({
      message: 'contains newlines',
      requiresConfirmation: false,
    });
  }
  if (value.includes('\0')) {
    warnings.push({
      message: 'contains null characters',
      requiresConfirmation: false,
    });
  }
  if (value === '') {
    warnings.push({
      message: 'is empty',
      requiresConfirmation: true,
    });
  }
  if (
    value.length > 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    warnings.push({
      message: 'includes surrounding quotes (these will be stored literally)',
      requiresConfirmation: false,
    });
  }

  return warnings;
}

/**
 * Combines warning messages into a single sentence.
 * e.g. ["starts with whitespace", "ends with whitespace"] -> "Value starts and ends with whitespace"
 */
export function formatWarnings(warnings: EnvWarning[]): string | null {
  if (warnings.length === 0) return null;
  const messages = warnings.map(w => w.message);

  // Special case: combine "starts with whitespace" + "ends with whitespace"
  const startsIdx = messages.indexOf('starts with whitespace');
  const endsIdx = messages.indexOf('ends with whitespace');
  if (startsIdx !== -1 && endsIdx !== -1) {
    messages.splice(Math.max(startsIdx, endsIdx), 1);
    messages[Math.min(startsIdx, endsIdx)] = 'starts and ends with whitespace';
  }

  if (messages.length === 1) {
    return `Value ${messages[0]}`;
  }
  if (messages.length === 2) {
    return `Value ${messages[0]} and ${messages[1]}`;
  }
  const last = messages.pop();
  return `Value ${messages.join(', ')}, and ${last}`;
}

/** Prefixes the API currently rejects for Secret variables. */
const API_PUBLIC_PREFIXES = [
  'NEXT_PUBLIC_',
  'VUE_APP_',
  'REACT_APP_',
  'GATSBY_',
  'GRIDSOME_',
  'NUXT_PUBLIC_',
  'STORYBOOK_',
  'VITE_',
  'PUBLIC_',
  'EXPO_PUBLIC_',
  'NG_APP_',
  'REDWOOD_ENV_',
] as const;

const LEGACY_PUBLIC_PREFIXES = [
  ...new Set(
    frameworkList.map(f => f.envPrefix).filter((p): p is string => !!p)
  ),
];

/** All known framework prefixes used for Config/Secret advisory guidance. */
const PUBLIC_PREFIXES = [
  ...new Set([
    ...API_PUBLIC_PREFIXES,
    ...frameworkList
      .map(f => f.envPrefix)
      .filter((prefix): prefix is string => !!prefix),
  ]),
];

const LEGACY_SENSITIVE_PATTERN =
  /(?:^|_)(password|secret|private|token|key|auth|jwt|signature)(?:_|$)/i;

/**
 * Returns true if all warnings are whitespace-related (can be trimmed).
 */
export function hasOnlyWhitespaceWarnings(warnings: EnvWarning[]): boolean {
  return (
    warnings.length > 0 &&
    warnings.every(
      w =>
        w.message === 'starts with whitespace' ||
        w.message === 'ends with whitespace'
    )
  );
}

/**
 * Trims trailing newline (common from piped input) and whitespace.
 */
export function trimValue(value: string): string {
  return value.replace(/\n$/, '').trim();
}

export interface NormalizeStdinEnvValueResult {
  value: string;
  strippedTrailingNewline: boolean;
}

/**
 * Normalize a single trailing line ending from stdin when the payload is
 * otherwise a single line. This preserves intentional multiline secrets while
 * fixing the common `echo "secret" | vercel env add ...` case.
 */
export function normalizeStdinEnvValue(
  value: string
): NormalizeStdinEnvValueResult {
  let valueWithoutTrailingNewline = value;

  if (value.endsWith('\r\n')) {
    valueWithoutTrailingNewline = value.slice(0, -2);
  } else if (value.endsWith('\n')) {
    valueWithoutTrailingNewline = value.slice(0, -1);
  } else {
    return {
      value,
      strippedTrailingNewline: false,
    };
  }

  if (
    valueWithoutTrailingNewline.includes('\n') ||
    valueWithoutTrailingNewline.includes('\r')
  ) {
    return {
      value,
      strippedTrailingNewline: false,
    };
  }

  return {
    value: valueWithoutTrailingNewline,
    strippedTrailingNewline: true,
  };
}

/**
 * Returns the public prefix if the key starts with one, null otherwise.
 */
export function getPublicPrefix(
  key: string,
  includeDashboardPrefixes = false
): string | null {
  const upperKey = key.toUpperCase();
  const prefixes = includeDashboardPrefixes
    ? PUBLIC_PREFIXES
    : LEGACY_PUBLIC_PREFIXES;
  return prefixes.find(p => upperKey.startsWith(p)) || null;
}

export function getApiPublicPrefix(key: string): string | null {
  const upperKey = key.toUpperCase();
  return (
    API_PUBLIC_PREFIXES.find(prefix => upperKey.startsWith(prefix)) ?? null
  );
}

export function parseSvelteKitPublicEnvVarPrefix(
  config: string
): { status: 'ready'; prefix: string | null } | { status: 'unavailable' } {
  if (!config.includes('publicPrefix')) {
    return { status: 'ready', prefix: null };
  }
  const match =
    /publicPrefix:\s*(?:'(?<single>[^']*)'|"(?<double>[^"]*)"|`(?<template>[^`$]*)`)/.exec(
      config
    );
  const prefix =
    match?.groups?.single ?? match?.groups?.double ?? match?.groups?.template;
  return prefix === undefined
    ? { status: 'unavailable' }
    : { status: 'ready', prefix };
}

/** Reads the same static SvelteKit publicPrefix syntax supported by Dashboard. */
export async function getLocalSvelteKitPublicPrefixes(
  cwd: string,
  rootDirectory?: string | null
): Promise<string[] | undefined> {
  const projectRoot = rootDirectory ? join(cwd, rootDirectory) : cwd;
  let config: string;
  try {
    config = await readFile(join(projectRoot, 'svelte.config.js'), 'utf8');
  } catch {
    return undefined;
  }
  const parsed = parseSvelteKitPublicEnvVarPrefix(config);
  if (parsed.status === 'unavailable') return undefined;
  return [parsed.prefix ?? 'PUBLIC_', 'VITE_'];
}

/**
 * Removes the public prefix from a key.
 * e.g. "NEXT_PUBLIC_API_KEY" -> "API_KEY"
 */
export function removePublicPrefix(
  key: string,
  includeDashboardPrefixes = false
): string {
  const prefix = getPublicPrefix(key, includeDashboardPrefixes);
  if (!prefix) return key;
  return key.slice(prefix.length);
}

export interface ValidateEnvValueResult {
  finalValue: string;
  alreadyConfirmed: boolean;
}

interface ValidateEnvValueOptions {
  envName: string;
  initialValue: string;
  skipConfirm: boolean;
  promptForValue: () => Promise<string>;
  selectAction: (choices: { name: string; value: string }[]) => Promise<string>;
  showWarning: (message: string) => void;
  showLog: (message: string) => void;
}

/**
 * Validates env value with interactive re-entry option.
 * Used by both `env add` and `env update` commands.
 */
export async function validateEnvValue(
  opts: ValidateEnvValueOptions
): Promise<ValidateEnvValueResult> {
  let finalValue = opts.initialValue;
  let alreadyConfirmed = false;

  if (!opts.skipConfirm) {
    let valueAccepted = false;
    while (!valueAccepted) {
      const valueWarnings = getEnvValueWarnings(finalValue);
      const warningMessage = formatWarnings(valueWarnings);

      if (!warningMessage) {
        valueAccepted = true;
        break;
      }

      opts.showWarning(warningMessage);

      const canTrim = hasOnlyWhitespaceWarnings(valueWarnings);
      const choices = canTrim
        ? [
            { name: 'Leave as is', value: 'c' },
            { name: 'Re-enter', value: 'r' },
            { name: 'Trim whitespace', value: 't' },
          ]
        : [
            { name: 'Leave as is', value: 'c' },
            { name: 'Re-enter', value: 'r' },
          ];

      const action = await opts.selectAction(choices);

      if (action === 'c') {
        valueAccepted = true;
        if (valueWarnings.some(w => w.requiresConfirmation)) {
          alreadyConfirmed = true;
        }
      } else if (action === 't') {
        finalValue = trimValue(finalValue);
        opts.showLog('Trimmed whitespace');
      } else {
        finalValue = await opts.promptForValue();
      }
    }
  } else {
    const valueWarnings = getEnvValueWarnings(finalValue);
    const warningMessage = formatWarnings(valueWarnings);
    if (warningMessage) {
      opts.showWarning(warningMessage);
    }
  }

  return { finalValue, alreadyConfirmed };
}

export function getEnvKeyWarnings(
  key: string,
  options: { configSecretUiEnabled?: boolean } = {}
): EnvWarning[] {
  const warnings: EnvWarning[] = [];
  const matchingPrefix = getPublicPrefix(key, options.configSecretUiEnabled);

  if (matchingPrefix) {
    const nameWithoutPrefix = key.slice(matchingPrefix.length);
    const sensitiveMatch = options.configSecretUiEnabled
      ? looksLikeSecret(nameWithoutPrefix) &&
        getMatchingServerOnlyKey(nameWithoutPrefix)
      : LEGACY_SENSITIVE_PATTERN.exec(key);
    if (sensitiveMatch) {
      warnings.push({
        message: options.configSecretUiEnabled
          ? `\`${matchingPrefix}\` exposes \`${key}\` to anyone visiting your site`
          : `The ${matchingPrefix} prefix will make ${nameWithoutPrefix} visible to anyone visiting your site`,
        requiresConfirmation: true,
      });
    } else {
      warnings.push({
        message: options.configSecretUiEnabled
          ? `\`${matchingPrefix}\` exposes this value to anyone visiting your site`
          : `${matchingPrefix} variables can be seen by anyone visiting your site`,
        requiresConfirmation: false,
      });
    }
  }

  return warnings;
}
