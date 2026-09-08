import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { describe, it, expect, afterEach } from 'vitest';
import { detectEntrypoint, detectRustEntrypoint } from '../../src/entrypoint';

const hasCargo = (() => {
  try {
    execSync('cargo --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const tempDirs: string[] = [];

function makeProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'vc-rust-entrypoint-'));
  tempDirs.push(dir);
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(dir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const MAIN = 'fn main() {}';

describe('detectRustEntrypoint', () => {
  it('returns a configured entrypoint that exists without invoking cargo', async () => {
    const workPath = makeProject({
      // Intentionally not a valid Cargo project: this path must not shell out.
      'src/bin/server.rs': MAIN,
    });

    expect(await detectRustEntrypoint(workPath, 'src/bin/server.rs')).toBe(
      'src/bin/server.rs'
    );
  });

  it('returns null when nothing can be detected', async () => {
    const workPath = makeProject({ 'README.md': 'not a cargo project' });
    expect(await detectRustEntrypoint(workPath)).toBeNull();
  });

  it.runIf(hasCargo)(
    'detects the default binary of a plain crate',
    async () => {
      const workPath = makeProject({
        'Cargo.toml': '[package]\nname = "app"\nversion = "0.1.0"\n',
        'src/main.rs': MAIN,
      });

      expect(await detectRustEntrypoint(workPath)).toBe('src/main.rs');
    }
  );

  it.runIf(hasCargo)(
    'resolves a `[[bin]]` target when the framework sentinel is absent',
    async () => {
      const workPath = makeProject({
        'Cargo.toml': [
          '[package]',
          'name = "app"',
          'version = "0.1.0"',
          '',
          '[[bin]]',
          'name = "server"',
          'path = "src/bin/server.rs"',
        ].join('\n'),
        'src/bin/server.rs': MAIN,
      });

      expect(await detectRustEntrypoint(workPath, 'src/main.rs')).toBe(
        'src/bin/server.rs'
      );
    }
  );

  it.runIf(hasCargo)('detects a `default-run` binary', async () => {
    const workPath = makeProject({
      'Cargo.toml':
        '[package]\nname = "app"\nversion = "0.1.0"\ndefault-run = "server"\n',
      'src/bin/server.rs': MAIN,
      'src/bin/worker.rs': MAIN,
    });

    expect(await detectRustEntrypoint(workPath)).toBe('src/bin/server.rs');
  });

  it.runIf(hasCargo)(
    'returns null for an ambiguous crate rather than guessing',
    async () => {
      const workPath = makeProject({
        'Cargo.toml': '[package]\nname = "app"\nversion = "0.1.0"\n',
        'src/bin/server.rs': MAIN,
        'src/bin/worker.rs': MAIN,
      });

      expect(await detectRustEntrypoint(workPath)).toBeNull();
    }
  );

  it.runIf(hasCargo)(
    'resolves a bare bin name to its source path',
    async () => {
      const workPath = makeProject({
        'Cargo.toml': '[package]\nname = "app"\nversion = "0.1.0"\n',
        'src/bin/server.rs': MAIN,
        'src/bin/worker.rs': MAIN,
      });

      expect(await detectRustEntrypoint(workPath, 'worker')).toBe(
        'src/bin/worker.rs'
      );
    }
  );

  it.runIf(hasCargo)('detects a binary inside a workspace member', async () => {
    const workPath = makeProject({
      'Cargo.toml':
        '[workspace]\nresolver = "2"\nmembers = ["crates/api"]\ndefault-members = ["crates/api"]\n',
      'crates/api/Cargo.toml': '[package]\nname = "api"\nversion = "0.1.0"\n',
      'crates/api/src/main.rs': MAIN,
    });

    expect(await detectRustEntrypoint(workPath)).toBe('crates/api/src/main.rs');
  });
});

describe('detectEntrypoint', () => {
  it('wraps the detected file in a DetectedEntrypoint', async () => {
    const workPath = makeProject({ 'src/main.rs': MAIN });
    // No Cargo.toml, so detection fails and returns null.
    expect(await detectEntrypoint({ workPath })).toBeNull();
  });

  it.runIf(hasCargo)('returns kind "file" for a detected crate', async () => {
    const workPath = makeProject({
      'Cargo.toml': '[package]\nname = "app"\nversion = "0.1.0"\n',
      'src/main.rs': MAIN,
    });

    expect(await detectEntrypoint({ workPath })).toEqual({
      kind: 'file',
      entrypoint: 'src/main.rs',
    });
  });
});
