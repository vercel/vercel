/**
 * Crypto utilities that provide secure implementations of cryptographic functions.
 * This module includes fixes for security vulnerabilities in standard implementations.
 */

/**
 * List of supported PBKDF2 algorithms to prevent uninitialized memory issues
 */
const SUPPORTED_PBKDF2_ALGORITHMS = [
  'SHA-1',
  'SHA-256',
  'SHA-384',
  'SHA-512',
] as const;

type SupportedPBKDF2Algorithm = typeof SUPPORTED_PBKDF2_ALGORITHMS[number];

/**
 * Options for PBKDF2 key derivation
 */
export interface PBKDF2Options {
  /** The algorithm to use for key derivation */
  algorithm: SupportedPBKDF2Algorithm;
  /** The number of iterations */
  iterations: number;
  /** The length of the derived key in bytes */
  keyLength: number;
  /** The salt as ArrayBuffer or Uint8Array */
  salt: ArrayBuffer | Uint8Array;
}

/**
 * Validates if an algorithm is supported for PBKDF2
 */
function isValidPBKDF2Algorithm(algorithm: string): algorithm is SupportedPBKDF2Algorithm {
  return SUPPORTED_PBKDF2_ALGORITHMS.includes(algorithm as SupportedPBKDF2Algorithm);
}

/**
 * Secure PBKDF2 implementation that prevents uninitialized memory vulnerabilities.
 * 
 * This function addresses the security issue where pbkdf2 returns predictable
 * uninitialized/zero-filled memory for non-normalized or unimplemented algorithms.
 * 
 * Instead of returning uninitialized memory, this implementation:
 * 1. Validates the algorithm name against a whitelist
 * 2. Throws a clear error for unsupported algorithms
 * 3. Uses the Web Crypto API with proper error handling
 * 
 * @param password - The password to derive the key from (as ArrayBuffer or Uint8Array)
 * @param options - PBKDF2 options including algorithm, iterations, key length, and salt
 * @returns Promise that resolves to the derived key as ArrayBuffer
 * @throws TypeError for invalid algorithms or parameters
 * @throws Error for crypto operations failures
 */
export async function securePBKDF2(
  password: ArrayBuffer | Uint8Array,
  options: PBKDF2Options
): Promise<ArrayBuffer> {
  // Validate algorithm to prevent uninitialized memory vulnerabilities
  if (!isValidPBKDF2Algorithm(options.algorithm)) {
    throw new TypeError(
      `Unsupported PBKDF2 algorithm: ${options.algorithm}. ` +
      `Supported algorithms: ${SUPPORTED_PBKDF2_ALGORITHMS.join(', ')}`
    );
  }

  // Validate required parameters
  if (!password) {
    throw new TypeError('Password is required for PBKDF2');
  }

  if (!options.salt) {
    throw new TypeError('Salt is required for PBKDF2');
  }

  if (!Number.isInteger(options.iterations) || options.iterations <= 0) {
    throw new TypeError('Iterations must be a positive integer');
  }

  if (!Number.isInteger(options.keyLength) || options.keyLength <= 0) {
    throw new TypeError('Key length must be a positive integer');
  }

  try {
    // Import the password as a key
    const keyMaterial = await (globalThis as any).crypto.subtle.importKey(
      'raw',
      password,
      'PBKDF2',
      false,
      ['deriveBits']
    );

    // Derive the key using PBKDF2
    const derivedKey = await (globalThis as any).crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: options.algorithm,
        salt: options.salt,
        iterations: options.iterations,
      },
      keyMaterial,
      options.keyLength * 8 // Convert bytes to bits
    );

    return derivedKey;
  } catch (error) {
    // Wrap crypto errors with more context
    if (error instanceof Error) {
      throw new Error(`PBKDF2 derivation failed: ${error.message}`);
    }
    throw new Error('PBKDF2 derivation failed with unknown error');
  }
}

/**
 * Helper function to generate a cryptographically secure random salt
 * @param length - The length of the salt in bytes (default: 32)
 * @returns ArrayBuffer containing the random salt
 */
export function generateSalt(length: number = 32): ArrayBuffer {
  if (!Number.isInteger(length) || length <= 0) {
    throw new TypeError('Salt length must be a positive integer');
  }

  return (globalThis as any).crypto.getRandomValues(new Uint8Array(length)).buffer;
}

/**
 * Converts an ArrayBuffer to a hex string
 * @param buffer - The buffer to convert
 * @returns Hex string representation
 */
export function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts a hex string to an ArrayBuffer
 * @param hex - The hex string to convert
 * @returns ArrayBuffer representation
 */
export function hexToBuffer(hex: string): ArrayBuffer {
  if (hex.length % 2 !== 0) {
    throw new TypeError('Hex string must have even length');
  }

  const buffer = new ArrayBuffer(hex.length / 2);
  const view = new Uint8Array(buffer);

  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    if (isNaN(byte)) {
      throw new TypeError('Invalid hex character in string');
    }
    view[i / 2] = byte;
  }

  return buffer;
}