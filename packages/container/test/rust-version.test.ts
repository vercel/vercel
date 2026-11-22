import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rust } from '../src/buildpacks/rust';

const { files } = vi.hoisted(() => ({ files: new Map<string, string>() }));
vi.mock('node:fs', () => ({
  existsSync: (path: string) => files.has(path),
  readFileSync: (path: string) => {
    if (!files.has(path)) throw new Error(`Unexpected file read: ${path}`);
    return files.get(path);
  },
}));

const workPath = join('/', 'project');

function resolve(projectFiles: Record<string, string> = {}) {
  for (const [name, contents] of Object.entries(projectFiles)) {
    files.set(join(workPath, name), contents);
  }
  return rust.resolveImage(workPath);
}

const image = (version: string) => ({
  version,
  buildImage: `docker.io/library/rust:${version}-bookworm`,
  runImage: 'gcr.io/distroless/cc-debian12',
});

beforeEach(() => {
  files.clear();
});

describe('Rust buildpack descriptor', () => {
  it('routes on Cargo.toml', () => {
    expect(rust.runtime).toBe('rust');
    expect(rust.projectMarkers).toEqual(['Cargo.toml']);
  });

  it('uses the latest stable image when nothing pins a version', async () => {
    expect(await resolve()).toEqual(image('1'));
  });
});

describe('Rust toolchain files', () => {
  it.each([
    ['[toolchain]\nchannel = "1.90.0"\n', '1.90.0'],
    ['[toolchain]\nchannel = "1.90"\n', '1.90'],
    ['[toolchain]\nchannel = " 1.90.0 "\n', '1.90.0'],
    [
      '[toolchain]\nchannel = "1.90.0"\ncomponents = ["rustfmt", "clippy"]\ntargets = ["wasm32-unknown-unknown"]\n',
      '1.90.0',
    ],
  ])('reads rust-toolchain.toml %j as %s', async (contents, version) => {
    expect(await resolve({ 'rust-toolchain.toml': contents })).toEqual(
      image(version)
    );
  });

  it.each([
    ['  1.90.0  \r\n', '1.90.0'],
    ['1.90\n', '1.90'],
    ['[toolchain]\nchannel = "1.90.0"\n', '1.90.0'],
  ])('reads legacy rust-toolchain %j as %s', async (contents, version) => {
    expect(await resolve({ 'rust-toolchain': contents })).toEqual(
      image(version)
    );
  });

  it.each([
    ['rust-toolchain.toml', '[toolchain]\nchannel = "stable"\n'],
    ['rust-toolchain.toml', '[toolchain]\nchannel = "beta"\n'],
    ['rust-toolchain.toml', '[toolchain]\nchannel = "nightly"\n'],
    ['rust-toolchain.toml', '[toolchain]\nchannel = "nightly-2025-01-01"\n'],
    [
      'rust-toolchain.toml',
      '[toolchain]\nchannel = "1.90.0-x86_64-unknown-linux-gnu"\n',
    ],
    ['rust-toolchain.toml', '[toolchain]\npath = "/opt/rust"\n'],
    ['rust-toolchain.toml', '[toolchain]\ncomponents = ["rustc"]\n'],
    ['rust-toolchain.toml', ''],
    ['rust-toolchain', 'stable\n'],
    ['rust-toolchain', 'nightly-2025-01-01\n'],
    ['rust-toolchain', ''],
    ['rust-toolchain', '   \n'],
  ])('falls back to the default image for %s %j', async (name, contents) => {
    expect(await resolve({ [name]: contents })).toEqual(image('1'));
  });

  it.each([
    '[toolchain]\nchannel = "1.90.0"\n',
    '[toolchain]\nchannel = "unterminated\n',
  ])('prefers the legacy file over rust-toolchain.toml: %j', async contents => {
    expect(
      await resolve({
        'rust-toolchain': '1.85.0\n',
        'rust-toolchain.toml': contents,
      })
    ).toEqual(image('1.85.0'));
  });

  it.each([
    'stable\n',
    '[toolchain]\ncomponents = ["rustc"]\n',
    '[toolchain]\npath = "/opt/rust"\n',
  ])('uses the default image when the legacy file has no numeric pin: %j', async contents => {
    expect(
      await resolve({
        'rust-toolchain': contents,
        'rust-toolchain.toml': '[toolchain]\nchannel = "1.85.0"\n',
      })
    ).toEqual(image('1'));
  });

  it('does not consult ancestor directories', async () => {
    files.set(
      join('/', 'rust-toolchain.toml'),
      '[toolchain]\nchannel = "1.85.0"\n'
    );
    files.set(join('/', 'rust-toolchain'), '1.85.0\n');
    expect(await resolve()).toEqual(image('1'));
  });

  it.each([
    'nightly-2025-01-01',
    '[toolchain]\nchannel = "1.90.0\n',
    '[toolchain]\nchannel = "1.90.0"\nchannel = "1.89.0"\n',
    'toolchain = "1.90.0"\n',
    '[toolchain]\nchannel = 1.90\n',
    '[toolchain]\nchannel = ["1.90.0"]\n',
    '[toolchain]\nchannel = ""\n',
  ])('rejects malformed rust-toolchain.toml: %j', async contents => {
    await expect(resolve({ 'rust-toolchain.toml': contents })).rejects.toThrow(
      'Invalid rust-toolchain.toml'
    );
  });
});

describe('Rust default entrypoint', () => {
  const defaultEntrypoint = (zeroConfig: boolean) =>
    rust.defaultEntrypoint!({ workPath, zeroConfig });

  it("builds a zero-config app's src/main.rs, like @vercel/rust", () => {
    files.set(join(workPath, 'src/main.rs'), '');
    expect(defaultEntrypoint(true)).toBe('src/main.rs');
  });

  it('leaves a services build to the buildpack', () => {
    files.set(join(workPath, 'src/main.rs'), '');
    expect(defaultEntrypoint(false)).toBeUndefined();
  });

  it('leaves a zero-config app without src/main.rs to the buildpack', () => {
    files.set(join(workPath, 'src/bin/api.rs'), '');
    expect(defaultEntrypoint(true)).toBeUndefined();
  });
});
