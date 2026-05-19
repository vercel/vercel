import { describe, expect, it } from 'vitest';
import type { Config, PackageJson } from '@vercel/build-utils';
import {
  getNitroInjectionBuildCommand,
  resolveNitroBin,
  shouldInjectNitro,
} from '../src/utils/inject-nitro';

function vitePkg(overrides: Partial<PackageJson> = {}): PackageJson {
  return {
    name: 'fixture',
    version: '0.0.0',
    scripts: { build: 'vite build' },
    dependencies: { vite: '6.0.0' },
    ...overrides,
  };
}

function emptyConfig(overrides: Partial<Config> = {}): Config {
  return { zeroConfig: true, projectSettings: {}, ...overrides };
}

describe('shouldInjectNitro()', () => {
  it('fires for any project using the default `vite build` script with no nitro dep', () => {
    expect(
      shouldInjectNitro({
        pkg: vitePkg(),
        config: emptyConfig(),
        buildCommand: null,
      })
    ).toBe(true);
  });

  it('fires regardless of framework slug — no allowlist', () => {
    // Project that looks nothing like TanStack should still get injected
    // as long as it matches the gates.
    expect(
      shouldInjectNitro({
        pkg: vitePkg({
          dependencies: {
            vite: '6.0.0',
            '@solidjs/start': '1.0.0',
          },
        }),
        config: emptyConfig(),
        buildCommand: null,
      })
    ).toBe(true);
  });

  it('skips when projectSettings.buildCommand is set', () => {
    expect(
      shouldInjectNitro({
        pkg: vitePkg(),
        config: emptyConfig({
          projectSettings: { buildCommand: 'custom build' },
        }),
        buildCommand: null,
      })
    ).toBe(false);
  });

  it('skips when a config-level buildCommand is provided', () => {
    expect(
      shouldInjectNitro({
        pkg: vitePkg(),
        config: emptyConfig(),
        buildCommand: 'pnpm run custom-build',
      })
    ).toBe(false);
  });

  it('skips when the build script is anything other than literal `vite build`', () => {
    // SvelteKit
    expect(
      shouldInjectNitro({
        pkg: vitePkg({ scripts: { build: 'svelte-kit sync && vite build' } }),
        config: emptyConfig(),
        buildCommand: null,
      })
    ).toBe(false);

    // VitePress
    expect(
      shouldInjectNitro({
        pkg: vitePkg({ scripts: { build: 'vitepress build docs' } }),
        config: emptyConfig(),
        buildCommand: null,
      })
    ).toBe(false);

    // React Router
    expect(
      shouldInjectNitro({
        pkg: vitePkg({ scripts: { build: 'react-router build' } }),
        config: emptyConfig(),
        buildCommand: null,
      })
    ).toBe(false);
  });

  it('skips when nitro dep is declared (user manages it themselves)', () => {
    expect(
      shouldInjectNitro({
        pkg: vitePkg({
          dependencies: { vite: '6.0.0', nitro: 'latest' },
        }),
        config: emptyConfig(),
        buildCommand: null,
      })
    ).toBe(false);

    expect(
      shouldInjectNitro({
        pkg: vitePkg({
          devDependencies: { nitro: 'latest' },
        }),
        config: emptyConfig(),
        buildCommand: null,
      })
    ).toBe(false);
  });

  it('skips when no package.json is found', () => {
    expect(
      shouldInjectNitro({
        pkg: null,
        config: emptyConfig(),
        buildCommand: null,
      })
    ).toBe(false);
  });

  it('tolerates whitespace around the build script', () => {
    expect(
      shouldInjectNitro({
        pkg: vitePkg({ scripts: { build: '  vite build  ' } }),
        config: emptyConfig(),
        buildCommand: null,
      })
    ).toBe(true);
  });
});

describe('resolveNitroBin()', () => {
  it('resolves to an absolute path inside the installed nitro package', () => {
    const bin = resolveNitroBin();
    // pnpm stores the package under its real name (`nitro-nightly`), so we
    // accept either spelling.
    expect(bin).toMatch(/[/\\]nitro(-nightly)?[/\\]/);
    expect(bin).toMatch(/\.(m?js|cjs)$/);
  });
});

describe('getNitroInjectionBuildCommand()', () => {
  it('invokes node against the resolved nitro CLI with --builder vite', () => {
    const cmd = getNitroInjectionBuildCommand();
    expect(cmd.startsWith('node ')).toBe(true);
    expect(cmd.endsWith(' build --builder vite')).toBe(true);
  });
});
