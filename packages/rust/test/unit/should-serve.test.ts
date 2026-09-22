import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import type { ShouldServeOptions } from '@vercel/build-utils';
import { shouldServe } from '../../src/index';
import { clearStandaloneModeCache } from '../../src/standalone-server';

const tempDirs: string[] = [];

function makeProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'vc-rust-should-serve-'));
  tempDirs.push(dir);
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(dir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return dir;
}

const STANDALONE_CARGO_TOML = `[package]
name = "app"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.8"
`;

const CRATE_CARGO_TOML = `[package]
name = "app"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.8"
vercel_runtime = { version = "2", features = ["axum"] }
`;

function makeOptions(
  workPath: string,
  overrides: Partial<ShouldServeOptions>
): ShouldServeOptions {
  return {
    entrypoint: 'src/main.rs',
    files: {},
    workPath,
    config: {},
    requestPath: '',
    ...overrides,
  } as ShouldServeOptions;
}

beforeEach(() => {
  clearStandaloneModeCache();
});

afterEach(() => {
  clearStandaloneModeCache();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('shouldServe', () => {
  describe('standalone server mode', () => {
    const project = () =>
      makeProject({
        'Cargo.toml': STANDALONE_CARGO_TOML,
        'src/main.rs': 'fn main() {}',
      });

    it.each([
      ['the root path', ''],
      ['arbitrary paths', 'some/path'],
      ['api-looking paths', 'api/hello'],
      ['static asset paths', 'favicon.ico'],
    ])('serves %s', async (_label, requestPath) => {
      const workPath = project();
      expect(await shouldServe(makeOptions(workPath, { requestPath }))).toBe(
        true
      );
    });

    it('does not depend on the framework slug', async () => {
      const workPath = project();
      for (const framework of [undefined, 'rust', 'axum', 'actix-web']) {
        clearStandaloneModeCache();
        expect(
          await shouldServe(
            makeOptions(workPath, {
              config: framework ? { framework } : {},
              requestPath: 'some/path',
            })
          )
        ).toBe(true);
      }
    });
  });

  // Regression: a `vercel_runtime` whole-app build is reached through the
  // preset's catch-all route, so it must not claim every path here. Doing so
  // shadows the static assets the `filesystem` phase serves first.
  describe('vercel_runtime whole-app build', () => {
    const project = () =>
      makeProject({
        'Cargo.toml': CRATE_CARGO_TOML,
        'src/main.rs': 'fn main() {}',
      });

    it('serves the entrypoint path', async () => {
      const workPath = project();
      expect(
        await shouldServe(makeOptions(workPath, { requestPath: 'src/main.rs' }))
      ).toBe(true);
    });

    it('serves the extensionless entrypoint path', async () => {
      const workPath = project();
      expect(
        await shouldServe(makeOptions(workPath, { requestPath: 'src/main' }))
      ).toBe(true);
    });

    it.each([
      '',
      'favicon.ico',
      'index.html',
      'some/path',
    ])('does not claim %j', async requestPath => {
      const workPath = project();
      expect(await shouldServe(makeOptions(workPath, { requestPath }))).toBe(
        false
      );
    });
  });

  describe('api handler build', () => {
    it.each([
      STANDALONE_CARGO_TOML,
      CRATE_CARGO_TOML,
    ])('serves only the entrypoint path', async cargoToml => {
      const workPath = makeProject({
        'Cargo.toml': cargoToml,
        'api/index.rs': 'fn main() {}',
      });
      const entrypoint = 'api/index.rs';

      expect(
        await shouldServe(
          makeOptions(workPath, { entrypoint, requestPath: 'api/index.rs' })
        )
      ).toBe(true);
      expect(
        await shouldServe(
          makeOptions(workPath, { entrypoint, requestPath: 'api/index' })
        )
      ).toBe(true);
      expect(
        await shouldServe(
          makeOptions(workPath, { entrypoint, requestPath: 'some/other' })
        )
      ).toBe(false);
    });
  });

  // The mode is cached per `workPath::entrypoint`; a shared cache keyed only by
  // entrypoint would leak one project's mode into another.
  it('resolves each project independently', async () => {
    const standalone = makeProject({
      'Cargo.toml': STANDALONE_CARGO_TOML,
      'src/main.rs': 'fn main() {}',
    });
    const crate = makeProject({
      'Cargo.toml': CRATE_CARGO_TOML,
      'src/main.rs': 'fn main() {}',
    });

    expect(
      await shouldServe(makeOptions(standalone, { requestPath: 'anything' }))
    ).toBe(true);
    expect(
      await shouldServe(makeOptions(crate, { requestPath: 'anything' }))
    ).toBe(false);
    // Re-resolve to exercise the cached path in both directions.
    expect(
      await shouldServe(makeOptions(standalone, { requestPath: 'anything' }))
    ).toBe(true);
    expect(
      await shouldServe(makeOptions(crate, { requestPath: 'anything' }))
    ).toBe(false);
  });
});
