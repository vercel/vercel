import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { vercelBuildpack } from './distribution';
import type { BuildpackRuntime } from './registry';

/**
 * Image tag used when go.mod declares no Go version a stock image provides:
 * the latest Go 1 release, which still builds older modules.
 */
const DEFAULT_GO_VERSION = '1';

const GO_IMAGE_REPOSITORY = 'docker.io/library/golang';

/**
 * A `CGO_ENABLED=1` build links against the build image's glibc, so build on
 * the Debian release the run image is based on.
 */
const GO_BUILD_IMAGE_DISTRO = 'bookworm';

/**
 * Distroless Debian 12 with glibc, libssl, libgcc and libstdc++, so cgo
 * executables that link C or C++ libraries run as well as static ones. It
 * has no shell or package manager.
 */
const GO_RUN_IMAGE = 'gcr.io/distroless/cc-debian12';

/**
 * Every release from Go 1.21 on has a `-bookworm` image. Older directives
 * resolve to the default tag instead: the `go` directive is a minimum, and
 * the latest toolchain builds older modules.
 */
const OLDEST_IMAGE_MINOR = 21;

/**
 * `@vercel/go`'s standalone server entrypoints, in the order it tries them.
 * A project detected as the Go preset has at least one.
 */
export const GO_CANDIDATE_ENTRYPOINTS = [
  'main.go',
  'cmd/api/main.go',
  'cmd/server/main.go',
] as const;

/** A numeric Go release, as a stock image tag names it: `1.25` or `1.25.3`. */
const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?$/;

const GO_DIRECTIVE_RE = /^\s*go[ \t]+(\S+)[ \t]*(?:\/\/[^\r\n]*)?$/m;
const TOOLCHAIN_DIRECTIVE_RE =
  /^\s*toolchain[ \t]+go(\S+)[ \t]*(?:\/\/[^\r\n]*)?$/m;

interface ImageVersion {
  /** As declared, which is also its stock image tag. */
  tag: string;
  /** Major, minor, patch (0 when undeclared), for ordering. */
  parts: [number, number, number];
}

/**
 * The stock image version a `go` or `toolchain` directive names, when it
 * names one: a numeric release no older than the oldest `-bookworm` image.
 * Pre-releases, custom toolchain suffixes, and anything Go itself would
 * reject never select an image tag.
 */
function parseImageVersion(
  value: string | undefined
): ImageVersion | undefined {
  if (value === undefined || !VERSION_RE.test(value)) return undefined;
  const parts = value.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) return undefined;
  if (parts[0] > 1 || (parts[0] === 1 && parts[1] >= OLDEST_IMAGE_MINOR)) {
    return { tag: value, parts: [parts[0], parts[1], parts[2] ?? 0] };
  }
  return undefined;
}

/** Compares releases numerically; a bare `1.N` ties its `1.N.0`. */
function compareImageVersions(a: ImageVersion, b: ImageVersion): number {
  return (
    a.parts[0] - b.parts[0] ||
    a.parts[1] - b.parts[1] ||
    a.parts[2] - b.parts[2]
  );
}

/**
 * The stock image tag for the Go a module builds with. The buildpack defaults
 * to `GOTOOLCHAIN=local`, so the image's Go is the toolchain that builds the
 * module and must satisfy go.mod: select the newer of the numeric `toolchain`
 * and `go` versions, with a bare `1.N` selecting that minor's latest release.
 */
function selectGoVersion(workPath: string): string {
  const goMod = join(workPath, 'go.mod');
  if (!existsSync(goMod)) return DEFAULT_GO_VERSION;
  const contents = readFileSync(goMod, 'utf8');
  const toolchain = parseImageVersion(
    TOOLCHAIN_DIRECTIVE_RE.exec(contents)?.[1]
  );
  const minimum = parseImageVersion(GO_DIRECTIVE_RE.exec(contents)?.[1]);
  const declared = [toolchain, minimum]
    .filter((version): version is ImageVersion => version !== undefined)
    .sort((a, b) => compareImageVersions(b, a));
  return declared[0]?.tag ?? DEFAULT_GO_VERSION;
}

/**
 * Vercel-owned Go buildpack; see `buildpacks/go` in vercel/buildpacks. It
 * compiles one `main` package and launches the executable directly, without
 * the IPC proxy `@vercel/go` wraps it in on Lambda.
 */
export const go: BuildpackRuntime = {
  runtime: 'go',
  projectMarkers: ['go.mod'],
  buildpacks: [vercelBuildpack('go')],
  async resolveImage(workPath) {
    const version = selectGoVersion(workPath);
    return {
      version,
      buildImage: `${GO_IMAGE_REPOSITORY}:${version}-${GO_BUILD_IMAGE_DISTRO}`,
      runImage: GO_RUN_IMAGE,
    };
  },
  defaultEntrypoint({ workPath, zeroConfig }) {
    const candidate = GO_CANDIDATE_ENTRYPOINTS.find(name =>
      existsSync(join(workPath, name))
    );
    // The package directory, so the buildpack builds all of its files.
    if (candidate) return posix.dirname(candidate);
    if (zeroConfig) {
      const last = GO_CANDIDATE_ENTRYPOINTS.length - 1;
      throw new Error(
        `Couldn't find the Go program to build. Add ${GO_CANDIDATE_ENTRYPOINTS.slice(0, last).join(', ')}, or ${GO_CANDIDATE_ENTRYPOINTS[last]}, or set the VERCEL_ENTRYPOINT environment variable to its package directory or a .go file in it.`
      );
    }
    return undefined;
  },
};
