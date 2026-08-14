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

    // Reset environment variables. Set to undefined so the spread copy
    // doesn't carry over real shell values into tests.
    process.env = { ...originalEnv };
    process.env.BLOB_READ_WRITE_TOKEN = undefined;
    process.env.VERCEL_OIDC_TOKEN = undefined;
    process.env.BLOB_STORE_ID = undefined;
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
        success: true,
        kind: 'rw',
        token: tokenFromFlag,
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
        success: true,
        kind: 'rw',
        token: tokenFromFlag,
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
        success: true,
        kind: 'rw',
        token: tokenFromFlag,
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
        success: true,
        kind: 'rw',
        token: envToken,
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
        success: true,
        kind: 'rw',
        token: envToken,
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
        success: true,
        kind: 'rw',
        token: envFileToken,
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
        success: true,
        kind: 'rw',
        token: lastToken,
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
          success: true,
          kind: 'rw',
          token,
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
          success: true,
          kind: 'rw',
          token,
        });
      }
    });
  });

  describe('--oidc-token + --store-id flag pair', () => {
    it('should resolve OIDC when both flags are passed', async () => {
      const oidcToken = 'eyJhbGc.payload.signature';
      const storeId = 'store_abc123';
      const argv = [
        'blob',
        'list',
        '--oidc-token',
        oidcToken,
        '--store-id',
        storeId,
      ];

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        success: true,
        kind: 'oidc',
        oidcToken,
        storeId,
      });
      expect(mockedCreateEnvObject).not.toHaveBeenCalled();
    });

    it('should support --flag=value equals form', async () => {
      const oidcToken = 'eyJhbGc.payload.signature';
      const storeId = 'store_abc123';
      const argv = [
        'blob',
        'list',
        `--oidc-token=${oidcToken}`,
        `--store-id=${storeId}`,
      ];

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        success: true,
        kind: 'oidc',
        oidcToken,
        storeId,
      });
    });

    it('should error when --oidc-token is passed without --store-id', async () => {
      const argv = [
        'blob',
        'list',
        '--oidc-token',
        'eyJhbGc.payload.signature',
      ];

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining(
          '--oidc-token and --store-id must be passed together'
        ),
      });
    });

    it('should error when --store-id is passed without --oidc-token', async () => {
      const argv = ['blob', 'list', '--store-id', 'store_abc123'];

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining(
          '--oidc-token and --store-id must be passed together'
        ),
      });
    });

    it('should not silently fall back to env when an OIDC flag is partial', async () => {
      // process.env has a working RW token, but the user passed only one
      // half of the OIDC pair. Hard-error rather than downgrading identity.
      process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_env_token';
      const argv = [
        'blob',
        'list',
        '--oidc-token',
        'eyJhbGc.payload.signature',
      ];

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining(
          '--oidc-token and --store-id must be passed together'
        ),
      });
    });

    it('should prioritize --rw-token over --oidc-token + --store-id', async () => {
      const rwToken = 'vercel_blob_rw_flag_token';
      const argv = [
        'blob',
        'list',
        '--rw-token',
        rwToken,
        '--oidc-token',
        'eyJhbGc.payload.signature',
        '--store-id',
        'store_abc123',
      ];

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        success: true,
        kind: 'rw',
        token: rwToken,
      });
      expect(mockedCreateEnvObject).not.toHaveBeenCalled();
    });
  });

  describe('OIDC environment variables', () => {
    it('should resolve OIDC from process.env when both vars are set', async () => {
      const oidcToken = 'eyJhbGc.payload.signature';
      const storeId = 'store_abc123';
      process.env.VERCEL_OIDC_TOKEN = oidcToken;
      process.env.BLOB_STORE_ID = storeId;
      const argv = ['blob', 'list'];

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        success: true,
        kind: 'oidc',
        oidcToken,
        storeId,
      });
      expect(mockedCreateEnvObject).not.toHaveBeenCalled();
    });

    it('should prioritize OIDC in process.env over BLOB_READ_WRITE_TOKEN', async () => {
      const oidcToken = 'eyJhbGc.payload.signature';
      const storeId = 'store_abc123';
      process.env.VERCEL_OIDC_TOKEN = oidcToken;
      process.env.BLOB_STORE_ID = storeId;
      process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_should_not_win';
      const argv = ['blob', 'list'];

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        success: true,
        kind: 'oidc',
        oidcToken,
        storeId,
      });
    });

    it('should resolve OIDC from .env.local when process.env is empty', async () => {
      const oidcToken = 'eyJhbGc.payload.signature';
      const storeId = 'store_abc123';
      mockedCreateEnvObject.mockResolvedValue({
        VERCEL_OIDC_TOKEN: oidcToken,
        BLOB_STORE_ID: storeId,
      });
      const argv = ['blob', 'list'];

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        success: true,
        kind: 'oidc',
        oidcToken,
        storeId,
      });
      expect(mockedCreateEnvObject).toHaveBeenCalled();
    });

    it('should error when only VERCEL_OIDC_TOKEN is set in process.env', async () => {
      process.env.VERCEL_OIDC_TOKEN = 'eyJhbGc.payload.signature';
      const argv = ['blob', 'list'];

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining(
          'VERCEL_OIDC_TOKEN and BLOB_STORE_ID must both be set'
        ),
      });
    });

    it('should error when only BLOB_STORE_ID is set in process.env', async () => {
      process.env.BLOB_STORE_ID = 'store_abc123';
      const argv = ['blob', 'list'];

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining(
          'VERCEL_OIDC_TOKEN and BLOB_STORE_ID must both be set'
        ),
      });
    });

    it('should error when only VERCEL_OIDC_TOKEN is set in .env.local', async () => {
      mockedCreateEnvObject.mockResolvedValue({
        VERCEL_OIDC_TOKEN: 'eyJhbGc.payload.signature',
      });
      const argv = ['blob', 'list'];

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining(
          'VERCEL_OIDC_TOKEN and BLOB_STORE_ID must both be set'
        ),
      });
    });

    it('should not silently fall back to RW when OIDC is partial in same source', async () => {
      // Bare RW present, but VERCEL_OIDC_TOKEN is also present without
      // BLOB_STORE_ID — the partial OIDC config wins over silent fallback.
      process.env.VERCEL_OIDC_TOKEN = 'eyJhbGc.payload.signature';
      process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_env_token';
      const argv = ['blob', 'list'];

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining(
          'VERCEL_OIDC_TOKEN and BLOB_STORE_ID must both be set'
        ),
      });
    });
  });

  describe('cross-source resolution', () => {
    it('should fall through to .env.local when process.env has no blob vars', async () => {
      const envFileToken = 'vercel_blob_rw_env_file_token';
      mockedCreateEnvObject.mockResolvedValue({
        BLOB_READ_WRITE_TOKEN: envFileToken,
      });
      const argv = ['blob', 'list'];

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        success: true,
        kind: 'rw',
        token: envFileToken,
      });
    });

    it('should not read .env.local when process.env resolves a complete credential', async () => {
      // Stale OIDC token in .env.local must not poison a complete RW
      // credential coming from the shell.
      process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_shell_token';
      mockedCreateEnvObject.mockResolvedValue({
        VERCEL_OIDC_TOKEN: 'eyJstale.token',
      });
      const argv = ['blob', 'list'];

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        success: true,
        kind: 'rw',
        token: 'vercel_blob_rw_shell_token',
      });
      expect(mockedCreateEnvObject).not.toHaveBeenCalled();
    });

    it('should error on partial OIDC in .env.local even with RW also present in .env.local', async () => {
      // Both partial OIDC and RW in the same source (.env.local) — surface
      // the misconfig rather than silently downgrading.
      mockedCreateEnvObject.mockResolvedValue({
        VERCEL_OIDC_TOKEN: 'eyJhbGc.payload.signature',
        BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_env_file_token',
      });
      const argv = ['blob', 'list'];

      const result = await getBlobRWToken(client, argv);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining(
          'VERCEL_OIDC_TOKEN and BLOB_STORE_ID must both be set'
        ),
      });
    });
  });
});
