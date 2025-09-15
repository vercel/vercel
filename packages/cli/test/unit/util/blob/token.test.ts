import { describe, beforeEach, expect, it, vi, afterEach } from 'vitest';
import { client } from '../../../mocks/client';
import { getBlobRWToken } from '../../../../src/util/blob/token';
import * as envDiffModule from '../../../../src/util/env/diff-env-files';

// Mock dependencies
vi.mock('../../../../src/util/env/diff-env-files');

const mockedCreateEnvObject = vi.mocked(envDiffModule.createEnvObject);

describe('getBlobRWToken', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();

    // Reset environment variables
    process.env = { ...originalEnv };
    process.env.BLOB_READ_WRITE_TOKEN = undefined;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('--rw-token flag priority', () => {
    it('should use --rw-token flag when provided', async () => {
      const tokenFromFlag = 'vercel_blob_rw_flag_token_456';
      const argv = [
        'blob',
        'copy',
        '--rw-token',
        tokenFromFlag,
        'source.txt',
        'dest.txt',
      ];

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        token: tokenFromFlag,
        success: true,
      });
      expect(mockedCreateEnvObject).not.toHaveBeenCalled();
    });

    it('should prioritize --rw-token over environment variables', async () => {
      process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_env_token_789';
      const tokenFromFlag = 'vercel_blob_rw_flag_token_456';
      const argv = [
        'blob',
        'copy',
        '--rw-token',
        tokenFromFlag,
        'source.txt',
        'dest.txt',
      ];

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        token: tokenFromFlag,
        success: true,
      });
      expect(mockedCreateEnvObject).not.toHaveBeenCalled();
    });

    it('should prioritize --rw-token over .env.local file', async () => {
      const tokenFromFlag = 'vercel_blob_rw_flag_token_456';
      const argv = [
        'blob',
        'copy',
        '--rw-token',
        tokenFromFlag,
        'source.txt',
        'dest.txt',
      ];

      mockedCreateEnvObject.mockResolvedValue({
        BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_env_file_token_123',
      });

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        token: tokenFromFlag,
        success: true,
      });
      expect(mockedCreateEnvObject).not.toHaveBeenCalled();
    });
  });

  describe('BLOB_READ_WRITE_TOKEN environment variable', () => {
    it('should use BLOB_READ_WRITE_TOKEN environment variable when no flag provided', async () => {
      const envToken = 'vercel_blob_rw_env_token_789';
      process.env.BLOB_READ_WRITE_TOKEN = envToken;
      const argv = ['blob', 'copy', 'source.txt', 'dest.txt'];

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        token: envToken,
        success: true,
      });
      expect(mockedCreateEnvObject).not.toHaveBeenCalled();
    });

    it('should prioritize environment variable over .env.local file', async () => {
      const envToken = 'vercel_blob_rw_env_token_priority';
      process.env.BLOB_READ_WRITE_TOKEN = envToken;
      const argv = ['blob', 'del', 'file.txt'];

      mockedCreateEnvObject.mockResolvedValue({
        BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_env_file_token_123',
      });

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        token: envToken,
        success: true,
      });
      expect(mockedCreateEnvObject).not.toHaveBeenCalled();
    });
  });

  describe('.env.local file fallback', () => {
    it('should read token from .env.local file when no flag or env var provided', async () => {
      const envFileToken = 'vercel_blob_rw_env_file_token_123';
      const argv = ['blob', 'copy', 'source.txt', 'dest.txt'];

      mockedCreateEnvObject.mockResolvedValue({
        BLOB_READ_WRITE_TOKEN: envFileToken,
      });

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        token: envFileToken,
        success: true,
      });
      expect(mockedCreateEnvObject).toHaveBeenCalledWith(
        expect.stringMatching(/\.env\.local$/)
      );
    });

    it('should return error when .env.local file cannot be read', async () => {
      const argv = ['blob', 'list'];

      mockedCreateEnvObject.mockRejectedValue(new Error('File not found'));

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        error: expect.any(String),
        success: false,
      });
    });

    it('should return error when .env.local file returns no environment variables', async () => {
      const argv = ['blob', 'list'];

      mockedCreateEnvObject.mockResolvedValue(undefined);

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        error: expect.any(String),
        success: false,
      });
    });

    it('should return error when BLOB_READ_WRITE_TOKEN is not in .env.local', async () => {
      const argv = ['blob', 'list'];

      mockedCreateEnvObject.mockResolvedValue({
        OTHER_VAR: 'some-value',
        ANOTHER_VAR: 'another-value',
      });

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        error: expect.any(String),
        success: false,
      });
    });

    it('should handle .env.local with empty BLOB_READ_WRITE_TOKEN', async () => {
      const argv = ['blob', 'list'];

      mockedCreateEnvObject.mockResolvedValue({
        BLOB_READ_WRITE_TOKEN: '',
        OTHER_VAR: 'some-value',
      });

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        error: expect.any(String),
        success: false,
      });
    });

    it('should handle .env.local with undefined BLOB_READ_WRITE_TOKEN', async () => {
      const argv = ['blob', 'list'];

      mockedCreateEnvObject.mockResolvedValue({
        BLOB_READ_WRITE_TOKEN: undefined,
        OTHER_VAR: 'some-value',
      });

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        error: expect.any(String),
        success: false,
      });
    });
  });

  describe('edge cases', () => {
    it('should handle multiple --rw-token flags (last one wins)', async () => {
      const firstToken = 'vercel_blob_rw_first_token';
      const lastToken = 'vercel_blob_rw_last_token';
      const argv = [
        'blob',
        'copy',
        '--rw-token',
        firstToken,
        '--rw-token',
        lastToken,
        'source.txt',
        'dest.txt',
      ];

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        token: lastToken,
        success: true,
      });
    });
  });

  describe('integration with different blob commands', () => {
    it('should work with all blob subcommands', async () => {
      const token = 'vercel_blob_rw_integration_token';
      const subcommands = [
        ['blob', 'list', '--rw-token', token],
        ['blob', 'put', '--rw-token', token, 'file.txt'],
        ['blob', 'copy', '--rw-token', token, 'source.txt', 'dest.txt'],
        ['blob', 'del', '--rw-token', token, 'file.txt'],
        ['blob', 'store', 'get', '--rw-token', token],
      ];

      for (const argv of subcommands) {
        const result = await getBlobRWToken(client, argv);
        expect(result).toEqual({
          token,
          success: true,
        });
      }
    });

    it('should handle mixed flag positions', async () => {
      const token = 'vercel_blob_rw_position_test';
      const argvVariations = [
        ['blob', '--rw-token', token, 'copy', 'source.txt', 'dest.txt'],
        ['blob', 'copy', '--rw-token', token, 'source.txt', 'dest.txt'],
        ['blob', 'copy', 'source.txt', '--rw-token', token, 'dest.txt'],
        ['blob', 'copy', 'source.txt', 'dest.txt', '--rw-token', token],
      ];

      for (const argv of argvVariations) {
        const result = await getBlobRWToken(client, argv);
        expect(result).toEqual({
          token,
          success: true,
        });
      }
    });
  });
});
