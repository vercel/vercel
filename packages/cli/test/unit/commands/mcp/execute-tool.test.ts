import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to test the buildArgvFromParams logic and executeCommandAsTool
// Since buildArgvFromParams is private, we test through executeCommandAsTool

describe('executeCommandAsTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns captured stdout output from command execution', async () => {
    // Mock a simple command handler that writes JSON to stdout
    vi.doMock('../../../../src/commands/deploy/index.js', () => ({
      default: async (client: any) => {
        client.stdout.write(
          JSON.stringify({ status: 'ok', message: 'Deployed' })
        );
        return 0;
      },
    }));

    const { executeCommandAsTool } = await import(
      '../../../../src/commands/mcp/execute-tool'
    );

    const mockClient = {
      argv: ['vercel'],
      apiUrl: 'https://api.vercel.com',
      authConfig: { token: 'test' },
      config: {},
      nonInteractive: false,
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      telemetryEventStore: { add: vi.fn() },
    };

    const result = await executeCommandAsTool(mockClient as any, 'deploy', {
      prod: true,
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('ok');

    vi.doUnmock('../../../../src/commands/deploy/index.js');
  });

  it('returns error result when command exits with non-zero code', async () => {
    vi.doMock('../../../../src/commands/deploy/index.js', () => ({
      default: async (client: any) => {
        client.stdout.write(
          JSON.stringify({ status: 'error', message: 'Failed' })
        );
        return 1;
      },
    }));

    const { executeCommandAsTool } = await import(
      '../../../../src/commands/mcp/execute-tool'
    );

    const mockClient = {
      argv: ['vercel'],
      apiUrl: 'https://api.vercel.com',
      authConfig: { token: 'test' },
      config: {},
      nonInteractive: false,
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      telemetryEventStore: { add: vi.fn() },
    };

    const result = await executeCommandAsTool(mockClient as any, 'deploy', {});

    expect(result.isError).toBe(true);

    vi.doUnmock('../../../../src/commands/deploy/index.js');
  });

  it('returns error result when command handler throws', async () => {
    vi.doMock('../../../../src/commands/deploy/index.js', () => ({
      default: async () => {
        throw new Error('Network failure');
      },
    }));

    const { executeCommandAsTool } = await import(
      '../../../../src/commands/mcp/execute-tool'
    );

    const mockClient = {
      argv: ['vercel'],
      apiUrl: 'https://api.vercel.com',
      authConfig: { token: 'test' },
      config: {},
      nonInteractive: false,
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      telemetryEventStore: { add: vi.fn() },
    };

    const result = await executeCommandAsTool(mockClient as any, 'deploy', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Network failure');

    vi.doUnmock('../../../../src/commands/deploy/index.js');
  });

  it('forces non-interactive mode on the captured client', async () => {
    let capturedNonInteractive = false;
    vi.doMock('../../../../src/commands/deploy/index.js', () => ({
      default: async (client: any) => {
        capturedNonInteractive = client.nonInteractive;
        client.stdout.write('{}');
        return 0;
      },
    }));

    const { executeCommandAsTool } = await import(
      '../../../../src/commands/mcp/execute-tool'
    );

    const mockClient = {
      argv: ['vercel'],
      apiUrl: 'https://api.vercel.com',
      authConfig: { token: 'test' },
      config: {},
      nonInteractive: false,
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      telemetryEventStore: { add: vi.fn() },
    };

    await executeCommandAsTool(mockClient as any, 'deploy', {});

    expect(capturedNonInteractive).toBe(true);

    vi.doUnmock('../../../../src/commands/deploy/index.js');
  });

  it('adds --non-interactive and --yes flags to argv', async () => {
    let capturedArgv: string[] = [];
    vi.doMock('../../../../src/commands/deploy/index.js', () => ({
      default: async (client: any) => {
        capturedArgv = client.argv;
        client.stdout.write('{}');
        return 0;
      },
    }));

    const { executeCommandAsTool } = await import(
      '../../../../src/commands/mcp/execute-tool'
    );

    const mockClient = {
      argv: ['vercel'],
      apiUrl: 'https://api.vercel.com',
      authConfig: { token: 'test' },
      config: {},
      nonInteractive: false,
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      telemetryEventStore: { add: vi.fn() },
    };

    await executeCommandAsTool(mockClient as any, 'deploy', {
      prod: true,
      target: 'production',
    });

    expect(capturedArgv).toContain('--non-interactive');
    expect(capturedArgv).toContain('--yes');
    expect(capturedArgv).toContain('--prod');
    expect(capturedArgv).toContain('--target');
    expect(capturedArgv).toContain('production');

    vi.doUnmock('../../../../src/commands/deploy/index.js');
  });

  it('passes array params as repeated flags', async () => {
    let capturedArgv: string[] = [];
    vi.doMock('../../../../src/commands/deploy/index.js', () => ({
      default: async (client: any) => {
        capturedArgv = client.argv;
        client.stdout.write('{}');
        return 0;
      },
    }));

    const { executeCommandAsTool } = await import(
      '../../../../src/commands/mcp/execute-tool'
    );

    const mockClient = {
      argv: ['vercel'],
      apiUrl: 'https://api.vercel.com',
      authConfig: { token: 'test' },
      config: {},
      nonInteractive: false,
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      telemetryEventStore: { add: vi.fn() },
    };

    await executeCommandAsTool(mockClient as any, 'deploy', {
      env: ['FOO=bar', 'BAZ=qux'],
    });

    expect(capturedArgv).toContain('--env');
    const envIndices = capturedArgv
      .map((v, i) => (v === '--env' ? i : -1))
      .filter(i => i >= 0);
    expect(envIndices).toHaveLength(2);
    expect(capturedArgv[envIndices[0] + 1]).toBe('FOO=bar');
    expect(capturedArgv[envIndices[1] + 1]).toBe('BAZ=qux');

    vi.doUnmock('../../../../src/commands/deploy/index.js');
  });

  it('includes positional args in argv', async () => {
    let capturedArgv: string[] = [];
    vi.doMock('../../../../src/commands/deploy/index.js', () => ({
      default: async (client: any) => {
        capturedArgv = client.argv;
        client.stdout.write('{}');
        return 0;
      },
    }));

    const { executeCommandAsTool } = await import(
      '../../../../src/commands/mcp/execute-tool'
    );

    const mockClient = {
      argv: ['vercel'],
      apiUrl: 'https://api.vercel.com',
      authConfig: { token: 'test' },
      config: {},
      nonInteractive: false,
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      telemetryEventStore: { add: vi.fn() },
    };

    await executeCommandAsTool(mockClient as any, 'deploy', {
      args: ['./my-app'],
    });

    expect(capturedArgv[0]).toBe('vercel');
    expect(capturedArgv[1]).toBe('deploy');
    expect(capturedArgv[2]).toBe('./my-app');

    vi.doUnmock('../../../../src/commands/deploy/index.js');
  });
});
