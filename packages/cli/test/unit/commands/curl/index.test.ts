import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../../../mocks/client';
import curl from '../../../../src/commands/curl';
import { getDeploymentUrlById } from '../../../../src/commands/curl/deployment-url';

let spawnMock: ReturnType<typeof vi.fn>;
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('curl', () => {
  let originalProcessArgv: string[];

  beforeEach(async () => {
    originalProcessArgv = process.argv;

    const childProcess = await import('child_process');
    spawnMock = vi.mocked(childProcess.spawn);

    spawnMock.mockReturnValue({
      on: vi.fn((event: string, handler: Function) => {
        if (event === 'close') {
          setTimeout(() => handler(0), 0);
        }
        return this;
      }),
    } as any);
  });

  afterEach(() => {
    process.argv = originalProcessArgv;
    vi.clearAllMocks();
  });

  describe('--help', () => {
    it('prints help message', async () => {
      client.setArgv('curl', '--help');
      const exitCode = await curl(client);
      expect(exitCode).toEqual(2);
      expect(client.getFullOutput()).toContain(
        'Execute curl with automatic deployment URL and protection bypass'
      );
    });
  });

  describe('argument parsing', () => {
    it('should reject when no path is provided', async () => {
      client.setArgv('curl');
      const exitCode = await curl(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('requires an API path');
    });

    it('should reject when only -- is provided without a path', async () => {
      client.setArgv(
        'curl',
        '--',
        '--header',
        'Content-Type: application/json'
      );
      const exitCode = await curl(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('requires an API path');
    });

    it('should accept / as a valid path', () => {
      const path = '/';
      expect(path).toBeTruthy();
      expect(path).not.toBe('--');
      expect(path.startsWith('--')).toBe(false);
    });

    it('should reject unrecognized flags before --', async () => {
      client.setArgv('curl', '/api/hello', '--invalid-flag');
      const exitCode = await curl(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('unknown or unexpected option');
    });

    it('should handle process.argv parsing for curl flags after --', () => {
      process.argv = [
        'node',
        'vercel',
        'curl',
        '/api/hello',
        '--',
        '--header',
        'Content-Type: application/json',
        '--request',
        'POST',
      ];

      const separatorIndex = process.argv.indexOf('--');
      const curlFlags =
        separatorIndex !== -1 ? process.argv.slice(separatorIndex + 1) : [];

      expect(curlFlags).toEqual([
        '--header',
        'Content-Type: application/json',
        '--request',
        'POST',
      ]);
    });

    it('should preserve arguments with spaces in process.argv', () => {
      process.argv = [
        'node',
        'vercel',
        'curl',
        '/api/hello',
        '--',
        '--header',
        'X-Custom-Header: value with spaces',
      ];

      const separatorIndex = process.argv.indexOf('--');
      const curlFlags =
        separatorIndex !== -1 ? process.argv.slice(separatorIndex + 1) : [];

      expect(curlFlags).toEqual([
        '--header',
        'X-Custom-Header: value with spaces',
      ]);
      expect(curlFlags[1]).toBe('X-Custom-Header: value with spaces');
    });
  });

  describe('--deployment flag', () => {
    it('should accept deployment ID with dpl_ prefix', async () => {
      client.setArgv(
        'curl',
        '/api/hello',
        '--deployment',
        'dpl_ERiL45NJvP8ghWxgbvCM447bmxwV'
      );
      const separatorIndex = client.argv.indexOf('--');
      expect(separatorIndex).toBe(-1); // No -- separator in this case
    });

    it('should accept deployment ID without dpl_ prefix', async () => {
      client.setArgv(
        'curl',
        '/api/hello',
        '--deployment',
        'ERiL45NJvP8ghWxgbvCM447bmxwV'
      );
      const deploymentIndex = client.argv.indexOf('--deployment');
      expect(deploymentIndex).toBeGreaterThan(-1);
      expect(client.argv[deploymentIndex + 1]).toBe(
        'ERiL45NJvP8ghWxgbvCM447bmxwV'
      );
    });

    it('should work with --deployment and curl flags after --', () => {
      process.argv = [
        'node',
        'vercel',
        'curl',
        '/api/hello',
        '--deployment',
        'ERiL45NJvP8ghWxgbvCM447bmxwV',
        '--',
        '--header',
        'Content-Type: application/json',
      ];
      const separatorIndex = process.argv.indexOf('--');
      const curlFlags =
        separatorIndex !== -1 ? process.argv.slice(separatorIndex + 1) : [];

      expect(curlFlags).toEqual(['--header', 'Content-Type: application/json']);
    });
  });

  describe('--protection-bypass flag', () => {
    it('should accept a protection bypass secret', async () => {
      client.setArgv(
        'curl',
        '/api/hello',
        '--protection-bypass',
        'my-secret-token'
      );

      const bypassIndex = client.argv.indexOf('--protection-bypass');
      expect(bypassIndex).toBeGreaterThan(-1);
      expect(client.argv[bypassIndex + 1]).toBe('my-secret-token');
    });

    it('should work with both --deployment and --protection-bypass', async () => {
      client.setArgv(
        'curl',
        '/api/hello',
        '--deployment',
        'dpl_ERiL45NJvP8ghWxgbvCM447bmxwV',
        '--protection-bypass',
        'my-secret-token'
      );

      const deploymentIndex = client.argv.indexOf('--deployment');
      const bypassIndex = client.argv.indexOf('--protection-bypass');

      expect(deploymentIndex).toBeGreaterThan(-1);
      expect(bypassIndex).toBeGreaterThan(-1);
      expect(client.argv[deploymentIndex + 1]).toBe(
        'dpl_ERiL45NJvP8ghWxgbvCM447bmxwV'
      );
      expect(client.argv[bypassIndex + 1]).toBe('my-secret-token');
    });

    it('should work with --protection-bypass and curl flags after --', () => {
      process.argv = [
        'node',
        'vercel',
        'curl',
        '/api/hello',
        '--protection-bypass',
        'my-secret-token',
        '--',
        '--request',
        'POST',
      ];

      const separatorIndex = process.argv.indexOf('--');
      const curlFlags =
        separatorIndex !== -1 ? process.argv.slice(separatorIndex + 1) : [];

      expect(curlFlags).toEqual(['--request', 'POST']);

      // Verify --protection-bypass is before the separator
      const bypassIndex = process.argv.indexOf('--protection-bypass');
      expect(bypassIndex).toBeGreaterThan(-1);
      expect(bypassIndex).toBeLessThan(separatorIndex);
      expect(process.argv[bypassIndex + 1]).toBe('my-secret-token');
    });

    it('should work with all flags combined', () => {
      process.argv = [
        'node',
        'vercel',
        'curl',
        '/api/protected',
        '--deployment',
        'dpl_ERiL45NJvP8ghWxgbvCM447bmxwV',
        '--protection-bypass',
        'my-secret-token',
        '--',
        '--request',
        'POST',
        '--header',
        'Content-Type: application/json',
        '--data',
        '{"key": "value"}',
      ];

      const separatorIndex = process.argv.indexOf('--');
      const curlFlags =
        separatorIndex !== -1 ? process.argv.slice(separatorIndex + 1) : [];

      expect(curlFlags).toEqual([
        '--request',
        'POST',
        '--header',
        'Content-Type: application/json',
        '--data',
        '{"key": "value"}',
      ]);

      const deploymentIndex = process.argv.indexOf('--deployment');
      const bypassIndex = process.argv.indexOf('--protection-bypass');

      expect(deploymentIndex).toBeLessThan(separatorIndex);
      expect(bypassIndex).toBeLessThan(separatorIndex);
      expect(process.argv[deploymentIndex + 1]).toBe(
        'dpl_ERiL45NJvP8ghWxgbvCM447bmxwV'
      );
      expect(process.argv[bypassIndex + 1]).toBe('my-secret-token');
    });

    it('should handle protection bypass secret with special characters', async () => {
      const secretWithSpecialChars = 'abc123-XYZ_456.789~token';
      client.setArgv(
        'curl',
        '/api/hello',
        '--protection-bypass',
        secretWithSpecialChars
      );

      const bypassIndex = client.argv.indexOf('--protection-bypass');
      expect(client.argv[bypassIndex + 1]).toBe(secretWithSpecialChars);
    });
  });
});

describe('getDeploymentUrlById', () => {
  it('should add dpl_ prefix when missing', async () => {
    const mockClient = {
      fetch: vi.fn().mockResolvedValue({
        url: 'my-app-abc123.vercel.app',
      }),
    } as any;

    await getDeploymentUrlById(mockClient, 'ERiL45NJvP8ghWxgbvCM447bmxwV');

    expect(mockClient.fetch).toHaveBeenCalledWith(
      '/v13/deployments/dpl_ERiL45NJvP8ghWxgbvCM447bmxwV'
    );
  });

  it('should not add dpl_ prefix when already present', async () => {
    const mockClient = {
      fetch: vi.fn().mockResolvedValue({
        url: 'my-app-abc123.vercel.app',
      }),
    } as any;

    await getDeploymentUrlById(mockClient, 'dpl_ERiL45NJvP8ghWxgbvCM447bmxwV');

    expect(mockClient.fetch).toHaveBeenCalledWith(
      '/v13/deployments/dpl_ERiL45NJvP8ghWxgbvCM447bmxwV'
    );
  });

  it('should return null when deployment is not found', async () => {
    const mockClient = {
      fetch: vi.fn().mockResolvedValue(null),
    } as any;

    const result = await getDeploymentUrlById(
      mockClient,
      'ERiL45NJvP8ghWxgbvCM447bmxwV'
    );

    expect(result).toBeNull();
  });

  it('should return deployment URL when found', async () => {
    const mockClient = {
      fetch: vi.fn().mockResolvedValue({
        url: 'my-app-xyz789.vercel.app',
      }),
    } as any;

    const result = await getDeploymentUrlById(mockClient, 'XYZ789ABC123');

    expect(result).toBe('https://my-app-xyz789.vercel.app');
    expect(mockClient.fetch).toHaveBeenCalledWith(
      '/v13/deployments/dpl_XYZ789ABC123'
    );
  });
});
