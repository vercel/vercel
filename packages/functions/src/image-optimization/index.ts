import { getVercelOidcToken } from '@vercel/oidc';

const DEFAULT_API_URL = 'https://api.vercel.com';

/**
 * Output format for the optimized image.
 */
export type OptimizeImageFormat = 'jpeg' | 'png' | 'webp' | 'avif';

/**
 * Options for image optimization.
 */
export interface OptimizeImageOptions {
  /**
   * The desired width of the optimized image in pixels (1-8192).
   */
  width: number;
  /**
   * The desired quality of the optimized image (1-100).
   * @default 75
   */
  quality?: number;
  /**
   * The desired output format. When omitted, the original format is
   * preserved.
   */
  format?: OptimizeImageFormat;
}

/**
 * Options for {@link optimizeImageFromBytes}.
 */
export interface OptimizeImageFromBytesOptions extends OptimizeImageOptions {
  /**
   * The media type of the source image bytes (e.g. `image/png`). When
   * omitted, the optimizer sniffs the type from the bytes.
   */
  contentType?: string;
  /**
   * A file name to attribute the source image to in usage reporting
   * (e.g. `logo.png`).
   */
  fileName?: string;
}

/**
 * The optimized image returned by the image optimization API.
 */
export interface OptimizedImage {
  /**
   * The optimized image bytes.
   */
  data: Uint8Array;
  /**
   * The media type of the optimized image (e.g. `image/webp`).
   */
  contentType: string;
}

class ImageOptimizationError extends Error {
  constructor(
    public status: number,
    body: string
  ) {
    super(`Image optimization request failed with status ${status}: ${body}`);
    this.name = 'ImageOptimizationError';
  }
}

function decodeTokenClaims(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload) {
    throw new Error('Malformed OIDC token: missing payload');
  }
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '='
  );
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

async function requestOptimize(
  path: string,
  searchParams: URLSearchParams,
  options: OptimizeImageOptions,
  init: { headers?: Record<string, string>; body?: Uint8Array<ArrayBuffer> }
): Promise<OptimizedImage> {
  const token = await getVercelOidcToken();
  const claims = decodeTokenClaims(token);
  const projectId = claims.project_id;
  if (typeof projectId !== 'string' || !projectId) {
    throw new Error('OIDC token is missing the "project_id" claim');
  }

  searchParams.set('width', String(options.width));
  searchParams.set('quality', String(options.quality ?? 75));
  if (options.format) {
    searchParams.set('format', `image/${options.format}`);
  }

  const apiUrl = process.env.VERCEL_IMAGE_OPTIMIZATION_API_URL?.length
    ? process.env.VERCEL_IMAGE_OPTIMIZATION_API_URL
    : DEFAULT_API_URL;
  const url = `${apiUrl}/v1/projects/${encodeURIComponent(
    projectId
  )}/image-optimization/${path}?${searchParams}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      ...init.headers,
    },
    body: init.body,
  });

  if (!res.ok) {
    throw new ImageOptimizationError(res.status, await res.text());
  }

  return {
    data: new Uint8Array(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') ?? 'application/octet-stream',
  };
}

/**
 * Optimize an image from its raw bytes using Vercel Image Optimization,
 * without requiring a deployment or the `next/image` configuration.
 *
 * Authenticates with the ambient Vercel OIDC token (available in Vercel
 * Functions automatically, or locally via `vercel env pull`), scoped to the
 * token's project.
 *
 * @example
 *
 * ```js
 * import { optimizeImageFromBytes } from '@vercel/functions';
 *
 * const res = await fetch('https://example.com/logo.png');
 * const { data } = await optimizeImageFromBytes(await res.bytes(), {
 *   width: 512,
 *   quality: 75,
 *   format: 'webp',
 * });
 * ```
 *
 * @param bytes - The source image bytes (max 5MB).
 * @param options - Width, quality, and output format.
 * @returns The optimized image bytes and content type.
 */
export async function optimizeImageFromBytes(
  bytes: Uint8Array | ArrayBuffer,
  options: OptimizeImageFromBytesOptions
): Promise<OptimizedImage> {
  // The cast narrows ArrayBufferLike to ArrayBuffer, which fetch's BodyInit
  // requires; SharedArrayBuffer-backed views are not supported here.
  const body =
    bytes instanceof Uint8Array
      ? (bytes as Uint8Array<ArrayBuffer>)
      : new Uint8Array(bytes);
  const searchParams = new URLSearchParams();
  if (options.fileName) {
    searchParams.set('fileName', options.fileName);
  }
  return requestOptimize('optimize-from-bytes', searchParams, options, {
    headers: {
      'content-type': options.contentType ?? 'application/octet-stream',
    },
    body,
  });
}

/**
 * Optimize an image fetched from a URL using Vercel Image Optimization,
 * without requiring a deployment or the `next/image` configuration.
 *
 * The URL is fetched server-side by Vercel; it must be a publicly reachable
 * `http(s)` URL. Authenticates with the ambient Vercel OIDC token (available
 * in Vercel Functions automatically, or locally via `vercel env pull`),
 * scoped to the token's project.
 *
 * @example
 *
 * ```js
 * import { optimizeImageFromUrl } from '@vercel/functions';
 *
 * const { data } = await optimizeImageFromUrl('https://example.com/logo.png', {
 *   width: 512,
 *   quality: 75,
 *   format: 'webp',
 * });
 * ```
 *
 * @param url - The URL of the source image to optimize.
 * @param options - Width, quality, and output format.
 * @returns The optimized image bytes and content type.
 */
export async function optimizeImageFromUrl(
  url: string,
  options: OptimizeImageOptions
): Promise<OptimizedImage> {
  const searchParams = new URLSearchParams({ url });
  return requestOptimize('optimize-from-url', searchParams, options, {});
}
