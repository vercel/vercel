/**
 * Podman runtime manifest — vendored distribution via this repo's Vercel project.
 *
 * This is the source of truth for:
 *  - which upstream Podman version we vendor
 *  - where the repacked tarballs live (served from `public/runtimes/podman/`)
 *  - per-platform SHA256 for verification
 *
 * Generation flow:
 *  1. `pnpm --filter @vercel/container build:podman-tarballs`  (local)
 *     or CI job `build-podman-runtimes` fetches official GitHub release assets,
 *     repacks them into our private layout:
 *       bin/podman
 *       libexec/podman/{gvproxy,vfkit|qemu,conmon,crun,netavark,aardvark-dns,pasta}
 *       share/containers/... (optional)
 *       data/machine/fedora-coreos-*.qcow2 (optional, pre-cached to avoid 2nd download)
 *     and writes them to `packages/container/dist-runtimes/podman-v<version>-<platform>.tar.gz`
 *     plus SHA256 sidecars.
 *
 *  2. `api/_lib/script/build.ts` (vercel-build) copies `dist-runtimes/*` into
 *     `public/runtimes/podman/v<version>/…` which becomes:
 *       https://<preview>.vercel.app/runtimes/podman/v<version>/<platform>.tar.gz
 *       https://vercel.com/runtimes/podman/v<version>/<platform>.tar.gz (prod alias)
 *
 *  3. At runtime on a user's machine `private.ts:resolveAssetSpec()` does:
 *       env override `VERCEL_PODMAN_ASSET_URL` → else → CDN manifest here.
 *     So `vercel dev` on a clean laptop auto-downloads from the deployment's CDN,
 *     no brew, no PATH, isolated under `~/.vercel/runtimes/podman/`.
 *
 * For PR testing with tarballs instead of local brew builds:
 *   pnpm --filter @vercel/container build:podman-tarballs -- --local
 *   VERCEL_PODMAN_ASSET_URL=file:///…/dist-runtimes/podman-v…-darwin-arm64.tar.gz pnpm vercel dev
 * or point at preview deployment:
 *   VERCEL_PODMAN_CDN_BASE=https://<preview-url> VERCEL_CONTAINER_ENGINE=podman-private vercel dev
 */

// Keep in sync with private.ts PRIVATE_PODMAN_VERSION. Single source is this file;
// private.ts should import VERSION from here in the future. For now duplicate is
// checked in build script.
export const PODMAN_VENDOR_VERSION = '5.4.2';

export type PlatformKey =
  | 'darwin-arm64'
  | 'darwin-amd64'
  | 'linux-amd64'
  | 'linux-arm64';

export type AssetType = 'tgz' | 'zip';

export interface CdnAssetSpec {
  url: string;
  sha256: string;
  type: AssetType;
  /** Uncompressed size hint for honest UI, optional */
  sizeHint?: string;
}

/**
 * Base URL for the runtime CDN.
 *
 * - Prod:  https://vercel.com
 * - Preview: https://<hash>-vercel.vercel.app  (from VERCEL_URL env, injected by platform)
 * - Local dev of the CDN itself: http://localhost:3000
 *
 * Overridable via `VERCEL_PODMAN_CDN_BASE` for PR testing.
 */
export function cdnBase(): string {
  const override = process.env.VERCEL_PODMAN_CDN_BASE?.trim().replace(
    /\/+$/,
    ''
  );
  if (override) return override;
  // When running inside the Vercel build / preview runtime, VERCEL_URL is set.
  if (process.env.VERCEL_URL) {
    const u = process.env.VERCEL_URL.replace(/\/+$/, '');
    return u.startsWith('http') ? u : `https://${u}`;
  }
  // Production stable alias — this repo's Vercel project serves `public/` from vercel.com
  // via the custom domain / alias configured for the runtime bucket. Adjust if your
  // project uses a different domain (e.g. `https://runtime.vercel.sh`).
  return 'https://vercel.com';
}

/**
 * Generated manifest is written after `build:podman-tarballs` runs.
 * Import is lazy so we don't crash when not yet built — file:// testing still works.
 */
type GeneratedManifest = Partial<Record<PlatformKey, CdnAssetSpec>>;

function loadGenerated(): GeneratedManifest {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./manifest.generated.json') as
      | GeneratedManifest
      | { default: GeneratedManifest };
    return ((mod as any).default ?? mod) as GeneratedManifest;
  } catch {
    return {};
  }
}

/**
 * Public CDN manifest — lazily computed so cdnBase() picks up VERCEL_URL / override
 * at call time, not import time. Critical for preview deploys:
 *   VERCEL_URL=<preview> => https://<preview>.vercel.app/runtimes/podman/…
 *   VERCEL_PODMAN_CDN_BASE override => that base.
 *
 * SHA is required in prod; local file:// testing can omit or use placeholder.
 */
function buildCdnManifest(): Record<PlatformKey, CdnAssetSpec> {
  const base = cdnBase();
  const v = PODMAN_VENDOR_VERSION;
  const generated = loadGenerated();
  const urlFor = (k: PlatformKey) =>
    `${base}/runtimes/podman/v${v}/podman-${k}.tar.gz`;

  const entries: Array<[PlatformKey, CdnAssetSpec]> = (
    [
      'darwin-arm64',
      'darwin-amd64',
      'linux-amd64',
      'linux-arm64',
    ] as PlatformKey[]
  ).map(k => {
    const g = generated[k];
    if (g?.sha256 && !/^0+$/.test(g.sha256)) {
      // Rebase URL to current cdnBase() so preview URLs always use the deployment that
      // actually serves the tarball (each push => unique VERCEL_URL). Stored JSON may
      // have a stale / relative URL; we normalize here.
      const normalizedUrl = g.url?.startsWith('http') ? g.url : urlFor(k);
      // If stored URL's host matches placeholder prod (vercel.com) but cdnBase is a
      // preview host, rewrite to preview host so PR testing hits the preview dist.
      let url = normalizedUrl;
      try {
        const stored = new URL(normalizedUrl);
        const desired = new URL(urlFor(k));
        if (
          stored.pathname === desired.pathname &&
          stored.host !== desired.host
        ) {
          // Same path, different host (e.g. stale prod URL vs current preview) -> use current base.
          url = desired.toString();
        }
      } catch {
        url = urlFor(k);
      }
      return [
        k,
        {
          url,
          sha256: g.sha256,
          type: g.type ?? 'tgz',
          sizeHint: g.sizeHint,
        } as CdnAssetSpec,
      ];
    }
    // Placeholder pre-build
    return [
      k,
      {
        url: urlFor(k),
        sha256: '0'.repeat(64),
        type: 'tgz' as const,
        sizeHint: k.startsWith('darwin')
          ? '~120MB + ~600MB VM image (isolated)'
          : '~60MB',
      },
    ];
  });

  return Object.fromEntries(entries) as Record<PlatformKey, CdnAssetSpec>;
}

// Lazy singleton so re-imports after env changes re-compute (useful in tests).
let _cdnManifestCache: Record<PlatformKey, CdnAssetSpec> | null = null;
let _cdnManifestBase: string | null = null;

function cachedManifest(): Record<PlatformKey, CdnAssetSpec> {
  const b = cdnBase();
  if (_cdnManifestCache && _cdnManifestBase === b) return _cdnManifestCache;
  _cdnManifestCache = buildCdnManifest();
  _cdnManifestBase = b;
  return _cdnManifestCache;
}

/** Exported as getter so callers never see a stale base when VERCEL_URL changes. */
export const CDN_MANIFEST: Record<PlatformKey, CdnAssetSpec> = new Proxy(
  {} as Record<PlatformKey, CdnAssetSpec>,
  {
    ownKeys: () => Object.keys(cachedManifest()),
    getOwnPropertyDescriptor: (_t, p) =>
      Object.getOwnPropertyDescriptor(cachedManifest(), p),
    has: (_t, p) => p in cachedManifest(),
    get: (_t, p) => (cachedManifest() as any)[p],
    getPrototypeOf: () => Object.getPrototypeOf(cachedManifest()),
  }
);

/** Force recompute (used in tests or after env mutation). */
export function __resetCdnManifestCache(): void {
  _cdnManifestCache = null;
  _cdnManifestBase = null;
}

/**
 * In CI/prod builds we want to ensure we never ship a zero-hash manifest.
 * Local dev with file:// tarballs can bypass via env.
 */
export function assertManifestComplete(opts?: {
  allowIncomplete?: boolean;
}): void {
  const envAllow = process.env.VERCEL_PODMAN_ALLOW_INCOMPLETE === '1';
  const allow = opts?.allowIncomplete ?? envAllow;
  if (allow) return;
  const incomplete = (
    Object.entries(CDN_MANIFEST) as Array<[PlatformKey, CdnAssetSpec]>
  )
    .filter(([, spec]) => !spec.sha256 || /^0+$/.test(spec.sha256))
    .map(([k]) => k);
  if (incomplete.length) {
    throw new Error(
      [
        `Podman CDN manifest incomplete for platforms: ${incomplete.join(', ')}`,
        `  Run: pnpm --filter @vercel/container build:podman-tarballs`,
        `  Or set VERCEL_PODMAN_ALLOW_INCOMPLETE=1 to allow placeholder hashes (dev only),`,
        `  or provide VERCEL_PODMAN_ASSET_URL=file://… for local testing.`,
        `  Manifest base: ${cdnBase()}  version: v${PODMAN_VENDOR_VERSION}`,
      ].join('\n')
    );
  }
}
