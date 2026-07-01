import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  getBootstrapDir,
  getProxyBinaryPath,
  createStandaloneLambda,
} from '../../src/index';

describe('getBootstrapDir', () => {
  it('returns a directory that exists', () => {
    const dir = getBootstrapDir();
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('contains the expected Go source files', () => {
    const dir = getBootstrapDir();
    const files = fs.readdirSync(dir);
    expect(files).toContain('proxy.go');
    expect(files).toContain('utils.go');
    expect(files).toContain('go.mod');
  });

  it('go.mod declares the ipc-proxy module', () => {
    const dir = getBootstrapDir();
    const goMod = fs.readFileSync(path.join(dir, 'go.mod'), 'utf8');
    expect(goMod).toContain('module ipc-proxy');
    expect(goMod).toContain('go 1.23');
  });
});

describe('getProxyBinaryPath', () => {
  // Assumes `pnpm build` has produced bin/ (always true in CI before tests).
  it('returns an existing binary for x86_64', () => {
    const binPath = getProxyBinaryPath('x86_64');
    expect(binPath.endsWith('proxy-linux-amd64')).toBe(true);
    expect(fs.existsSync(binPath)).toBe(true);
    expect(fs.statSync(binPath).size).toBeGreaterThan(0);
  });

  it('returns an existing binary for arm64', () => {
    const binPath = getProxyBinaryPath('arm64');
    expect(binPath.endsWith('proxy-linux-arm64')).toBe(true);
    expect(fs.existsSync(binPath)).toBe(true);
    expect(fs.statSync(binPath).size).toBeGreaterThan(0);
  });
});

describe('createStandaloneLambda', () => {
  it('assembles a Lambda with the proxy as executable and the user server', async () => {
    const userServerPath = path.join(
      os.tmpdir(),
      `ipc-proxy-user-server-${Date.now()}`
    );
    fs.writeFileSync(userServerPath, 'fake-user-server-binary');

    try {
      const lambda = await createStandaloneLambda({
        userServerPath,
        architecture: 'arm64',
        runtimeLanguage: 'rust',
      });

      expect(lambda.handler).toBe('executable');
      expect(lambda.runtime).toBe('executable');
      expect(lambda.runtimeLanguage).toBe('rust');
      expect(lambda.supportsResponseStreaming).toBe(true);
      expect(Object.keys(lambda.files)).toContain('executable');
      expect(Object.keys(lambda.files)).toContain('user-server');
    } finally {
      fs.rmSync(userServerPath, { force: true });
    }
  });
});
