import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ciInfo from 'ci-info';
import type Client from '../client';

const execFileAsync = promisify(execFile);

/**
 * Name of the native helper binary. It is built by
 * `scripts/build-biometric-helper.mjs` into `dist-native/` and is only shipped
 * with the macOS native CLI binary — never with the npm package.
 */
const HELPER_BINARY_NAME = 'biometric-helper';

/**
 * Environment variable that overrides the helper binary location. Primarily for
 * tests, but also lets packaging point at the extracted helper if needed.
 */
const HELPER_PATH_ENV_VAR = 'VERCEL_BIOMETRIC_HELPER_PATH';

/**
 * Environment variable the helper reads to decide where to persist the Secure
 * Enclave key blob. Keeping it per-invocation lets the CLI scope the key to its
 * global config directory (and, later, to a specific account/session).
 */
const HELPER_KEY_FILE_ENV_VAR = 'VERCEL_BIOMETRIC_KEY_FILE';

/** Signing can block on a Touch ID prompt, so it gets a generous timeout. */
const SIGN_TIMEOUT_MS = 120_000;
/** Non-interactive commands should return promptly. */
const QUICK_TIMEOUT_MS = 15_000;

export interface BiometricCapabilities {
  platform: string;
  supported: boolean;
  hasKey: boolean;
  biometryAvailable: boolean;
  userPresenceAvailable: boolean;
  biometryType: string;
  secureEnclaveAvailable: boolean;
}

export interface BiometricRegistration {
  keyId: string;
  /** Always `ES256` (ECDSA P-256 / SHA-256). */
  algorithm: string;
  /** `secure-enclave`. */
  storage: string;
  /** Base64url-encoded x9.63 (uncompressed) public key. */
  publicKey: string;
}

export interface BiometricSignature {
  keyId: string;
  algorithm: string;
  storage: string;
  /** Base64url-encoded ECDSA signature in X9.62 DER form. */
  signature: string;
}

export interface BiometricDeletion {
  deleted: boolean;
}

/**
 * Normalized, fallback-safe failure reasons. Every caller can treat any of
 * these as "biometric step-up is not available right now — fall back to the
 * device-code flow." The `reason` is what callers branch on; `code` and
 * `message` are preserved for debugging and telemetry.
 */
export type BiometricFailureReason = 'unsupported' | 'canceled' | 'error';

export interface BiometricError {
  ok: false;
  reason: BiometricFailureReason;
  /** Raw code from the helper (or a wrapper-assigned code). */
  code: string;
  message: string;
}

export type BiometricResult<T> = ({ ok: true } & T) | BiometricError;

interface HelperJsonError {
  ok: false;
  error: string;
  code: string;
}

/**
 * Options identifying how to invoke the helper. Kept explicit (rather than
 * derived from `Client` inside every call) so the command functions are pure
 * and trivially testable with a mock helper.
 */
export interface BiometricHelperOptions {
  helperPath: string;
  keyFile: string;
}

function unsupported(message: string): BiometricError {
  return { ok: false, reason: 'unsupported', code: 'unsupported', message };
}

/**
 * The path the helper should use to persist its Secure Enclave key blob, scoped
 * to the CLI's global config directory AND the logged-in Vercel user. Per-user
 * scoping means switching accounts on one machine never reuses another
 * account's key — the same binding the API will enforce server-side later.
 */
export function biometricKeyFilePath(
  globalConfigDir: string,
  userId: string
): string {
  return join(globalConfigDir, 'biometric', userId, 'step-up-key.blob');
}

/**
 * Records which Vercel user a Secure Enclave key was created for. This is
 * client-side bookkeeping (anyone with file access can edit it) — the real,
 * unforgeable binding arrives when the public key is registered with the API.
 * Until then it keeps multi-account machines honest and gives step-up a
 * structural place to enforce "key must belong to the logged-in user".
 */
export interface BiometricBinding {
  version: 1;
  keyId: string;
  userId: string;
  createdAt: number;
  policy: 'biometryCurrentSet';
}

export function biometricBindingFilePath(keyFile: string): string {
  return join(dirname(keyFile), 'binding.json');
}

/**
 * Read the binding manifest next to the key blob. Missing, unreadable, or
 * malformed manifests all return `null` — callers treat that as "no usable
 * binding" and re-register rather than failing.
 */
export async function readBiometricBinding(
  keyFile: string
): Promise<BiometricBinding | null> {
  let raw: string;
  try {
    raw = await readFile(biometricBindingFilePath(keyFile), 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<BiometricBinding>;
    if (
      parsed.version === 1 &&
      typeof parsed.keyId === 'string' &&
      typeof parsed.userId === 'string' &&
      typeof parsed.createdAt === 'number'
    ) {
      return parsed as BiometricBinding;
    }
  } catch {
    // fall through
  }
  return null;
}

export async function writeBiometricBinding(
  keyFile: string,
  binding: BiometricBinding
): Promise<void> {
  const path = biometricBindingFilePath(keyFile);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(binding, null, 2)}\n`, {
    mode: 0o600,
  });
}

/**
 * Locate the native helper binary. Checks the env override first, then a few
 * best-effort locations relative to this module (covering both the bundled
 * `dist/` runtime and running from source). Returns `null` when not found —
 * which is the expected case for the npm-installed CLI, on non-macOS, etc.
 */
export function resolveHelperPath(): string | null {
  const override = process.env[HELPER_PATH_ENV_VAR];
  if (override) {
    return existsSync(override) ? override : null;
  }

  // Walk up from this module looking for a sibling `dist-native/` directory.
  // When bundled this module lives in `dist/`; from source it lives in
  // `src/util/biometric/`. In both cases `dist-native/` sits at the package
  // root, so a bounded upward search finds it without hard-coding depth.
  let dir: string;
  try {
    dir = dirname(fileURLToPath(import.meta.url));
  } catch {
    return null;
  }

  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'dist-native', HELPER_BINARY_NAME);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return null;
}

/**
 * Cheap, side-effect-free check of whether biometric step-up could even be
 * attempted in this environment. Does NOT verify Secure Enclave availability or
 * that a key exists — call {@link getBiometricCapabilities} for that. Returns
 * the helper path when viable, or a normalized `unsupported` error. The key
 * file is NOT resolved here because it is scoped to the logged-in user, which
 * requires a network lookup — see {@link biometricKeyFilePath}.
 */
export function resolveBiometricHelper(
  client: Client
): BiometricResult<{ helperPath: string }> {
  if (process.platform !== 'darwin') {
    return unsupported('Biometric step-up is only available on macOS.');
  }

  if (ciInfo.isCI || process.env.CI) {
    return unsupported('Biometric step-up is not available in CI.');
  }

  if (!client.stdin.isTTY) {
    return unsupported('Biometric step-up requires an interactive terminal.');
  }

  const helperPath = resolveHelperPath();
  if (!helperPath) {
    return unsupported('The biometric helper is not available in this build.');
  }

  return { ok: true, helperPath };
}

function isHelperJsonError(value: unknown): value is HelperJsonError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    value.ok === false &&
    'code' in value &&
    typeof value.code === 'string' &&
    'error' in value &&
    typeof value.error === 'string'
  );
}

function normalizeHelperError(parsed: HelperJsonError): BiometricError {
  let reason: BiometricFailureReason;
  switch (parsed.code) {
    case 'unsupported':
      reason = 'unsupported';
      break;
    case 'canceled':
      reason = 'canceled';
      break;
    default:
      reason = 'error';
      break;
  }
  return { ok: false, reason, code: parsed.code, message: parsed.error };
}

/**
 * Invoke the helper with the given arguments and parse its JSON output. The
 * helper always prints a single JSON object to stdout — including for failures,
 * where it also exits non-zero — so this reads stdout on both success and
 * failure paths. Any spawn failure or unparseable output is normalized into an
 * `error` result so callers never have to catch.
 */
async function runHelper(
  options: BiometricHelperOptions,
  args: string[],
  timeoutMs: number
): Promise<unknown | BiometricError> {
  let stdout: string;
  try {
    const result = await execFileAsync(options.helperPath, args, {
      env: {
        ...process.env,
        [HELPER_KEY_FILE_ENV_VAR]: options.keyFile,
      },
      maxBuffer: 1024 * 1024,
      timeout: timeoutMs,
    });
    stdout = result.stdout;
  } catch (err: unknown) {
    // Non-zero exit: the helper still printed its JSON error to stdout.
    const maybe = err as { stdout?: string; message?: string };
    if (typeof maybe.stdout === 'string' && maybe.stdout.trim() !== '') {
      stdout = maybe.stdout;
    } else {
      return {
        ok: false,
        reason: 'error',
        code: 'helper_spawn_failed',
        message: maybe.message ?? 'Failed to run the biometric helper.',
      };
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return {
      ok: false,
      reason: 'error',
      code: 'helper_invalid_output',
      message: 'The biometric helper returned malformed output.',
    };
  }

  if (isHelperJsonError(parsed)) {
    return normalizeHelperError(parsed);
  }

  return parsed;
}

function isError(value: unknown): value is BiometricError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { ok: unknown }).ok === false
  );
}

export async function getBiometricCapabilities(
  options: BiometricHelperOptions
): Promise<BiometricResult<{ capabilities: BiometricCapabilities }>> {
  const parsed = await runHelper(options, ['capabilities'], QUICK_TIMEOUT_MS);
  if (isError(parsed)) {
    return parsed;
  }
  return { ok: true, capabilities: parsed as BiometricCapabilities };
}

export async function registerBiometricKey(
  options: BiometricHelperOptions
): Promise<BiometricResult<{ registration: BiometricRegistration }>> {
  const parsed = await runHelper(options, ['register-key'], QUICK_TIMEOUT_MS);
  if (isError(parsed)) {
    return parsed;
  }
  return { ok: true, registration: parsed as BiometricRegistration };
}

export async function signBiometricChallenge(
  options: BiometricHelperOptions,
  challenge: string
): Promise<BiometricResult<{ signature: BiometricSignature }>> {
  const parsed = await runHelper(
    options,
    ['sign-challenge', challenge],
    SIGN_TIMEOUT_MS
  );
  if (isError(parsed)) {
    return parsed;
  }
  return { ok: true, signature: parsed as BiometricSignature };
}

export async function deleteBiometricKey(
  options: BiometricHelperOptions
): Promise<BiometricResult<{ deletion: BiometricDeletion }>> {
  const parsed = await runHelper(options, ['delete-key'], QUICK_TIMEOUT_MS);
  if (isError(parsed)) {
    return parsed;
  }
  return { ok: true, deletion: parsed as BiometricDeletion };
}
