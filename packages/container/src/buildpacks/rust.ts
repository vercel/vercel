import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { vercelBuildpack } from './distribution';
import type { BuildpackRuntime } from './registry';
import { isValidVersion } from './version';

const DEFAULT_RUST_VERSION = '1';
const RUST_IMAGE_REPOSITORY = 'docker.io/library/rust';

// Keep the build and run images on the same Debian release for glibc compatibility.
const RUST_BUILD_IMAGE_DISTRO = 'bookworm';
const RUST_RUN_IMAGE = 'gcr.io/distroless/cc-debian12';

// rustup prefers the legacy file when both exist.
const RUST_TOOLCHAIN_FILES = ['rust-toolchain', 'rust-toolchain.toml'] as const;

export const rust: BuildpackRuntime = {
  runtime: 'rust',
  projectMarkers: ['Cargo.toml'],
  buildpacks: [vercelBuildpack('rust')],
  async resolveImage(workPath) {
    const version = selectRustVersion(workPath) ?? DEFAULT_RUST_VERSION;
    return {
      version,
      buildImage: `${RUST_IMAGE_REPOSITORY}:${version}-${RUST_BUILD_IMAGE_DISTRO}`,
      runImage: RUST_RUN_IMAGE,
    };
  },
  defaultEntrypoint({ workPath, zeroConfig }) {
    // Like `@vercel/rust`, a zero-config app builds the Rust preset's
    // src/main.rs, even when default-run names another binary.
    return zeroConfig && existsSync(join(workPath, 'src/main.rs'))
      ? 'src/main.rs'
      : undefined;
  },
};

// Numeric pins select an image tag. The buildpack validates other toolchain requests.
function selectRustVersion(workPath: string): string | undefined {
  for (const name of RUST_TOOLCHAIN_FILES) {
    const file = join(workPath, name);
    if (existsSync(file)) {
      const channel = parseToolchainFile(name, readFileSync(file, 'utf8'));
      return channel !== undefined && isValidVersion(channel)
        ? channel
        : undefined;
    }
  }
  return undefined;
}

function parseToolchainFile(
  name: string,
  contents: string
): string | undefined {
  const legacy = name === 'rust-toolchain';
  let document: Record<string, unknown> | undefined;
  try {
    document = parseToml(contents);
  } catch (error) {
    if (!legacy) {
      throw new Error(`Invalid ${name}: ${(error as Error).message}`);
    }
  }

  if (document === undefined || !('toolchain' in document)) {
    // The legacy file also accepts a bare channel name.
    return legacy ? contents.trim() || undefined : undefined;
  }

  const { toolchain } = document;
  if (typeof toolchain !== 'object' || toolchain === null) {
    throw new Error(`Invalid ${name}: [toolchain] must be a table.`);
  }
  const { channel } = toolchain as { channel?: unknown };
  if (channel === undefined) {
    return undefined;
  }
  if (typeof channel !== 'string' || channel.trim() === '') {
    throw new Error(
      `Invalid ${name}: toolchain.channel must be a string such as "1.90.0" or "stable".`
    );
  }
  return channel.trim();
}
