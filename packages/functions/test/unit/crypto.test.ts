import { describe, test, expect } from 'vitest';
import {
  securePBKDF2,
  generateSalt,
  bufferToHex,
  hexToBuffer,
  type PBKDF2Options,
} from '../../src/crypto';

describe('crypto utilities', () => {
  describe('securePBKDF2', () => {
    test('should derive key with valid SHA-256 algorithm', async () => {
      const password = new TextEncoder().encode('test-password');
      const salt = generateSalt(16);
      
      const options: PBKDF2Options = {
        algorithm: 'SHA-256',
        iterations: 1000,
        keyLength: 32,
        salt,
      };

      const result = await securePBKDF2(password, options);
      
      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBe(32);
    });

    test('should derive key with all supported algorithms', async () => {
      const password = new TextEncoder().encode('test-password');
      const salt = generateSalt(16);
      
      const algorithms = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;
      
      for (const algorithm of algorithms) {
        const options: PBKDF2Options = {
          algorithm,
          iterations: 1000,
          keyLength: 32,
          salt,
        };

        const result = await securePBKDF2(password, options);
        expect(result).toBeInstanceOf(ArrayBuffer);
        expect(result.byteLength).toBe(32);
      }
    });

    test('should produce different results with different salts', async () => {
      const password = new TextEncoder().encode('test-password');
      const salt1 = generateSalt(16);
      const salt2 = generateSalt(16);
      
      const options1: PBKDF2Options = {
        algorithm: 'SHA-256',
        iterations: 1000,
        keyLength: 32,
        salt: salt1,
      };

      const options2: PBKDF2Options = {
        algorithm: 'SHA-256',
        iterations: 1000,
        keyLength: 32,
        salt: salt2,
      };

      const result1 = await securePBKDF2(password, options1);
      const result2 = await securePBKDF2(password, options2);
      
      expect(bufferToHex(result1)).not.toBe(bufferToHex(result2));
    });

    test('should produce same result with same inputs', async () => {
      const password = new TextEncoder().encode('test-password');
      const salt = hexToBuffer('deadbeefcafebabe0123456789abcdef');
      
      const options: PBKDF2Options = {
        algorithm: 'SHA-256',
        iterations: 1000,
        keyLength: 32,
        salt,
      };

      const result1 = await securePBKDF2(password, options);
      const result2 = await securePBKDF2(password, options);
      
      expect(bufferToHex(result1)).toBe(bufferToHex(result2));
    });

    test('should throw TypeError for invalid algorithm', async () => {
      const password = new TextEncoder().encode('test-password');
      const salt = generateSalt(16);
      
      const options = {
        algorithm: 'INVALID-ALGO' as any,
        iterations: 1000,
        keyLength: 32,
        salt,
      };

      await expect(securePBKDF2(password, options)).rejects.toThrow(TypeError);
      await expect(securePBKDF2(password, options)).rejects.toThrow(
        'Unsupported PBKDF2 algorithm: INVALID-ALGO'
      );
    });

    test('should throw TypeError for normalized invalid algorithm', async () => {
      const password = new TextEncoder().encode('test-password');
      const salt = generateSalt(16);
      
      // Test case that would potentially return uninitialized memory
      const options = {
        algorithm: 'sha256' as any, // lowercase - not normalized
        iterations: 1000,
        keyLength: 32,
        salt,
      };

      await expect(securePBKDF2(password, options)).rejects.toThrow(TypeError);
    });

    test('should throw TypeError for empty algorithm', async () => {
      const password = new TextEncoder().encode('test-password');
      const salt = generateSalt(16);
      
      const options = {
        algorithm: '' as any,
        iterations: 1000,
        keyLength: 32,
        salt,
      };

      await expect(securePBKDF2(password, options)).rejects.toThrow(TypeError);
    });

    test('should throw TypeError for null/undefined algorithm', async () => {
      const password = new TextEncoder().encode('test-password');
      const salt = generateSalt(16);
      
      const options1 = {
        algorithm: null as any,
        iterations: 1000,
        keyLength: 32,
        salt,
      };

      const options2 = {
        algorithm: undefined as any,
        iterations: 1000,
        keyLength: 32,
        salt,
      };

      await expect(securePBKDF2(password, options1)).rejects.toThrow(TypeError);
      await expect(securePBKDF2(password, options2)).rejects.toThrow(TypeError);
    });

    test('should throw TypeError for missing password', async () => {
      const salt = generateSalt(16);
      
      const options: PBKDF2Options = {
        algorithm: 'SHA-256',
        iterations: 1000,
        keyLength: 32,
        salt,
      };

      await expect(securePBKDF2(null as any, options)).rejects.toThrow(TypeError);
      await expect(securePBKDF2(undefined as any, options)).rejects.toThrow(TypeError);
    });

    test('should throw TypeError for missing salt', async () => {
      const password = new TextEncoder().encode('test-password');
      
      const options = {
        algorithm: 'SHA-256' as const,
        iterations: 1000,
        keyLength: 32,
        salt: null as any,
      };

      await expect(securePBKDF2(password, options)).rejects.toThrow(TypeError);
    });

    test('should throw TypeError for invalid iterations', async () => {
      const password = new TextEncoder().encode('test-password');
      const salt = generateSalt(16);
      
      const invalidIterations = [0, -1, 1.5, NaN, Infinity, 'string' as any];
      
      for (const iterations of invalidIterations) {
        const options = {
          algorithm: 'SHA-256' as const,
          iterations,
          keyLength: 32,
          salt,
        };

        await expect(securePBKDF2(password, options)).rejects.toThrow(TypeError);
      }
    });

    test('should throw TypeError for invalid key length', async () => {
      const password = new TextEncoder().encode('test-password');
      const salt = generateSalt(16);
      
      const invalidLengths = [0, -1, 1.5, NaN, Infinity, 'string' as any];
      
      for (const keyLength of invalidLengths) {
        const options = {
          algorithm: 'SHA-256' as const,
          iterations: 1000,
          keyLength,
          salt,
        };

        await expect(securePBKDF2(password, options)).rejects.toThrow(TypeError);
      }
    });
  });

  describe('generateSalt', () => {
    test('should generate salt with default length', () => {
      const salt = generateSalt();
      expect(salt).toBeInstanceOf(ArrayBuffer);
      expect(salt.byteLength).toBe(32);
    });

    test('should generate salt with custom length', () => {
      const lengths = [8, 16, 24, 32, 48, 64];
      
      for (const length of lengths) {
        const salt = generateSalt(length);
        expect(salt).toBeInstanceOf(ArrayBuffer);
        expect(salt.byteLength).toBe(length);
      }
    });

    test('should generate different salts', () => {
      const salt1 = generateSalt(16);
      const salt2 = generateSalt(16);
      
      expect(bufferToHex(salt1)).not.toBe(bufferToHex(salt2));
    });

    test('should throw TypeError for invalid length', () => {
      const invalidLengths = [0, -1, 1.5, NaN, Infinity, 'string' as any];
      
      for (const length of invalidLengths) {
        expect(() => generateSalt(length)).toThrow(TypeError);
      }
    });
  });

  describe('bufferToHex', () => {
    test('should convert buffer to hex string', () => {
      const buffer = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]).buffer;
      const hex = bufferToHex(buffer);
      
      expect(hex).toBe('000102fffefd');
    });

    test('should handle empty buffer', () => {
      const buffer = new ArrayBuffer(0);
      const hex = bufferToHex(buffer);
      
      expect(hex).toBe('');
    });
  });

  describe('hexToBuffer', () => {
    test('should convert hex string to buffer', () => {
      const hex = '000102fffefd';
      const buffer = hexToBuffer(hex);
      const view = new Uint8Array(buffer);
      
      expect(view).toEqual(new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]));
    });

    test('should handle empty hex string', () => {
      const hex = '';
      const buffer = hexToBuffer(hex);
      
      expect(buffer.byteLength).toBe(0);
    });

    test('should throw TypeError for odd length hex string', () => {
      const invalidHex = '0001ff';
      
      expect(() => hexToBuffer(invalidHex)).toThrow(TypeError);
    });

    test('should throw TypeError for invalid hex characters', () => {
      const invalidHex = ['gg', '0z', 'xy01', '00!1'];
      
      for (const hex of invalidHex) {
        expect(() => hexToBuffer(hex)).toThrow(TypeError);
      }
    });
  });

  describe('roundtrip conversion', () => {
    test('should maintain data integrity through hex conversion', () => {
      const original = new Uint8Array([0x00, 0x01, 0x10, 0x7f, 0x80, 0xff]).buffer;
      const hex = bufferToHex(original);
      const converted = hexToBuffer(hex);
      
      expect(new Uint8Array(converted)).toEqual(new Uint8Array(original));
    });
  });
});