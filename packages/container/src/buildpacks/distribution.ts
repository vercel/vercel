import { info } from '../util';
import distributionJson from './distribution.json';
import type { BuildpackRuntime } from './registry';

export interface PinnedArchive {
  url: string;
  sha256: string;
}

/** A vercel buildpack (`vercel-<name>-<version>.cnb`) from the release mirror. */
export interface PinnedBuildpack {
  /** Release name and Blob path segment, e.g. `ruby`. */
  name: string;
  /** Buildpack id from its `buildpack.toml`, e.g. `vercel/ruby`. */
  id: string;
  version: string;
  /** Checksum of the published `.cnb`. */
  sha256: string;
  /**
   * Where the `.cnb` lives when it is not at the release location, e.g. a
   * pre-release published from a vercel/buildpacks pull request. Releases
   * leave this unset and derive the URL from `name` and `version`.
   */
  url?: string;
}

/**
 * The shape of `distribution.json`. Bumps edit that file only; assigning it
 * to this type checks the edit.
 */
export interface Distribution {
  /** Public Vercel Blob store mirroring vercel/buildpacks releases and the lifecycle. */
  baseUrl: string;
  lifecycle: { version: string; sha256: string };
  /** Packaged buildpacks by release name (the Blob path segment). */
  buildpacks: Readonly<Record<string, Omit<PinnedBuildpack, 'name'>>>;
}

export const distribution: Distribution = distributionJson;

export const BUILDPACK_DIST_BASE_URL = distribution.baseUrl;
export const LIFECYCLE_VERSION = distribution.lifecycle.version;

/**
 * The CNB lifecycle binary, shared by every buildpack.
 */
export const LIFECYCLE: PinnedArchive = {
  url: `${BUILDPACK_DIST_BASE_URL}/lifecycle/${LIFECYCLE_VERSION}/lifecycle-v${LIFECYCLE_VERSION}-linux-x86-64.tgz`,
  sha256: distribution.lifecycle.sha256,
};

export const PRERELEASE_URL_ENV = 'VERCEL_BUILDPACK_PRERELEASE_URL';

const SHA256_RE = /^[0-9a-f]{64}$/;
const ARTIFACT_PREFIX = 'vercel-';
const ARTIFACT_SUFFIX = '.cnb';
const ARTIFACT_NAME_RE = /^[A-Za-z0-9_-]+$/;
const ARTIFACT_VERSION_RE = /^\d+\.\d+\.\d+$/;

/** The release artifact file name for a buildpack: `vercel-<name>-<version>.cnb`. */
function artifactFileName(name: string, version: string): string {
  return `${ARTIFACT_PREFIX}${name}-${version}${ARTIFACT_SUFFIX}`;
}

/** Inverse of `artifactFileName`; undefined when the file name breaks the convention. */
function parseArtifactFileName(
  fileName: string
): { name: string; version: string } | undefined {
  if (
    !fileName.startsWith(ARTIFACT_PREFIX) ||
    !fileName.endsWith(ARTIFACT_SUFFIX)
  ) {
    return undefined;
  }
  const inner = fileName.slice(ARTIFACT_PREFIX.length, -ARTIFACT_SUFFIX.length);
  const separator = inner.lastIndexOf('-');
  const name = separator > 0 ? inner.slice(0, separator) : '';
  const version = separator > 0 ? inner.slice(separator + 1) : '';
  if (!ARTIFACT_NAME_RE.test(name) || !ARTIFACT_VERSION_RE.test(version)) {
    return undefined;
  }
  return { name, version };
}

/** The pinned release of a packaged buildpack, by release name. */
export function vercelBuildpack(name: string): PinnedBuildpack {
  const pinned = distribution.buildpacks[name];
  if (!pinned) {
    throw new Error(
      `distribution.json does not pin a "${name}" buildpack; add it under "buildpacks".`
    );
  }
  return { name, ...pinned };
}

/**
 * Where a vercel buildpack lives on the mirror, following the release layout
 * unless the entry names its own archive URL.
 */
export function vercelBuildpackArtifact(
  buildpack: PinnedBuildpack
): PinnedArchive {
  const { name, version } = buildpack;
  return {
    url:
      buildpack.url ??
      `${BUILDPACK_DIST_BASE_URL}/buildpacks/${name}/${version}/${artifactFileName(name, version)}`,
    sha256: buildpack.sha256,
  };
}

function parseArchiveUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${PRERELEASE_URL_ENV} must be an https .cnb archive URL.`);
  }
  const fileName = url.pathname.split('/').at(-1) ?? '';
  const artifact = parseArtifactFileName(fileName);
  if (url.protocol !== 'https:' || !artifact) {
    throw new Error(
      `${PRERELEASE_URL_ENV} must be a plain https URL ending in vercel-<name>-<version>.cnb.`
    );
  }
  return {
    url: url.href,
    fileName,
    name: artifact.name,
    version: artifact.version,
  };
}

export function getPrereleaseUrl(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const value = env[PRERELEASE_URL_ENV]?.trim();
  return value ? parseArchiveUrl(value).url : undefined;
}

export async function withPrereleaseBuildpack(
  buildpack: BuildpackRuntime,
  archiveUrl: string
): Promise<BuildpackRuntime> {
  const archive = parseArchiveUrl(archiveUrl);
  const entry = buildpack.buildpacks.find(
    candidate =>
      candidate.name === archive.name &&
      candidate.id === `vercel/${archive.name}`
  );
  if (!entry) {
    throw new Error(
      `Pre-release archive ${archive.fileName} does not match a buildpack in the ${buildpack.runtime} runtime.`
    );
  }

  // Append `.sha256` to the archive path (not the whole href) so that signed
  // blob URLs, which carry credentials in the query string, still resolve to
  // the checksum object rather than mangling `.sha256` into the query value.
  const checksumUrlObj = new URL(archive.url);
  checksumUrlObj.pathname += '.sha256';
  const checksumUrl = checksumUrlObj.href;
  const response = await fetch(checksumUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch pre-release checksum for ${archive.fileName}: HTTP ${response.status} ${response.statusText}`
    );
  }
  const fields = (await response.text()).trim().split(/\s+/);
  const [sha256, fileName] = fields;
  if (
    fields.length !== 2 ||
    !SHA256_RE.test(sha256) ||
    fileName !== archive.fileName
  ) {
    throw new Error(
      `Invalid pre-release checksum: expected a SHA-256 checksum for ${archive.fileName}.`
    );
  }

  info(`Using pre-release ${entry.id}@${archive.version}`);
  return {
    ...buildpack,
    buildpacks: buildpack.buildpacks.map(candidate =>
      candidate === entry
        ? { ...entry, version: archive.version, sha256, url: archive.url }
        : candidate
    ),
  };
}
