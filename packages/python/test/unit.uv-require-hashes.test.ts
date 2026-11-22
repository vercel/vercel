import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import { UvRunner } from '../src/uv';

const isWin = process.platform === 'win32';

interface RecordedUvCall {
  args: string[];
  requireHashes: string | null;
}

/**
 * Write a fake `uv` that records its args and `UV_REQUIRE_HASHES` to
 * `outputPath`, so tests can observe the real child process environment.
 */
function makeRecordingUv(dir: string, outputPath: string): string {
  const scriptPath = path.join(dir, 'record-uv.js');
  fs.writeFileSync(
    scriptPath,
    `require('fs').writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify({
  args: process.argv.slice(2),
  requireHashes: process.env.UV_REQUIRE_HASHES ?? null,
}));\n`,
    'utf8'
  );

  const uvBin = path.join(dir, `uv${isWin ? '.cmd' : ''}`);
  if (isWin) {
    fs.writeFileSync(
      uvBin,
      `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`,
      'utf8'
    );
  } else {
    fs.writeFileSync(
      uvBin,
      `#!/bin/sh\nexec "${process.execPath}" "${scriptPath}" "$@"\n`,
      'utf8'
    );
    fs.chmodSync(uvBin, 0o755);
  }
  return uvBin;
}

describe('UvRunner UV_REQUIRE_HASHES handling', () => {
  const originalRequireHashes = process.env.UV_REQUIRE_HASHES;
  let dir: string;
  let outputPath: string;
  let runner: UvRunner;

  beforeEach(() => {
    dir = path.join(
      tmpdir(),
      `vc-test-uv-hashes-${Math.floor(Math.random() * 1e6)}`
    );
    fs.mkdirSync(dir, { recursive: true });
    outputPath = path.join(dir, 'uv-call.json');
    runner = new UvRunner(makeRecordingUv(dir, outputPath));
    process.env.UV_REQUIRE_HASHES = 'true';
  });

  afterEach(() => {
    if (originalRequireHashes === undefined) {
      delete process.env.UV_REQUIRE_HASHES;
    } else {
      process.env.UV_REQUIRE_HASHES = originalRequireHashes;
    }
    fs.removeSync(dir);
  });

  function readRecordedCall(): RecordedUvCall {
    return fs.readJsonSync(outputPath);
  }

  it('drops UV_REQUIRE_HASHES from pip commands', async () => {
    await runner.pip({
      venvPath: path.join(dir, '.venv'),
      projectDir: dir,
      args: ['install', '--no-require-hashes', 'vercel-runtime==0.23.3'],
    });

    expect(readRecordedCall()).toEqual({
      args: ['pip', 'install', '--no-require-hashes', 'vercel-runtime==0.23.3'],
      requireHashes: null,
    });
  });

  it('keeps UV_REQUIRE_HASHES for user dependency installs', async () => {
    await runner.sync({
      venvPath: path.join(dir, '.venv'),
      projectDir: dir,
    });

    const call = readRecordedCall();
    expect(call.args[0]).toBe('sync');
    expect(call.requireHashes).toBe('true');
  });
});
