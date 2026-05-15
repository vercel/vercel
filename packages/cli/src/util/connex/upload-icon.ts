import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type Client from '../client';

/**
 * Maximum icon file size accepted by the CLI preflight. Matches the
 * server-side URL-upload limit (5 MB) so that direct file uploads and
 * URL-sourced icons share the same ceiling. The generic `/v2/files`
 * endpoint allows much larger uploads, but a connector icon should not be.
 */
const MAX_ICON_BYTES = 5 * 1024 * 1024;

/**
 * Minimum byte count required before we trust a magic-byte match. Matches
 * the API-side check in `now-fmeta-util/check-file-type.ts` so we reject
 * truncated fragments that happen to share a 3- or 4-byte prefix with a
 * real PNG/JPEG.
 */
const MIN_IMAGE_BYTES = 12;

/**
 * Magic-byte preflight: the `/v2/files` endpoint does not validate image
 * format and `resolveConnexIcon` only logs format-validation failures (it
 * still stores the SHA). So uploading a non-image would succeed silently and
 * surface as a broken icon in the dashboard. Reject early at the CLI layer.
 *
 * Signature list mirrors the API-side `now-fmeta-util/check-file-type.ts`
 * so the CLI rejects formats the API would also reject.
 */
const IMAGE_SIGNATURES: RegExp[] = [
  /^ffd8ffdb/, // JPEG raw
  /^ffd8ffe000104a4649460001/, // JFIF with marker
  /^ffd8ffee/, // Adobe JPEG
  /^ffd8ffe1.{4}457869660000/, // Exif: 2-byte segment length then "Exif\0\0"
  /^ffd8ffe0/, // JFIF (lenient)
  /^89504e470d0a1a0a/, // PNG
];

function isImageBuffer(buf: Buffer): boolean {
  if (buf.length < MIN_IMAGE_BYTES) {
    return false;
  }
  const hex = buf.subarray(0, MIN_IMAGE_BYTES).toString('hex');
  return IMAGE_SIGNATURES.some(re => re.test(hex));
}

export interface PreparedIcon {
  buf: Buffer;
  sha: string;
}

/**
 * Reads an icon file, runs the magic-byte check, and computes its SHA-1.
 * No network calls happen here — call this BEFORE team selection so an
 * invalid icon never reaches `selectConnexTeam` or any network call.
 *
 * Relative `filePath` values are resolved against `cwd` so the global
 * `--cwd` flag is honored (matches `alerts/rules/add.ts` and other commands
 * in this repo).
 *
 * Throws a user-facing error if the file is unreadable or is not a PNG/JPEG.
 */
export async function prepareConnexIcon(
  filePath: string,
  cwd: string
): Promise<PreparedIcon> {
  const absPath = resolve(cwd, filePath);
  let size: number;
  try {
    size = (await stat(absPath)).size;
  } catch (err) {
    throw new Error(
      `Could not read icon file at "${filePath}": ${(err as Error).message}`
    );
  }
  if (size > MAX_ICON_BYTES) {
    throw new Error(
      `Icon file at "${filePath}" is ${size} bytes; maximum is ${MAX_ICON_BYTES} bytes (5 MB).`
    );
  }
  let buf: Buffer;
  try {
    buf = await readFile(absPath);
  } catch (err) {
    throw new Error(
      `Could not read icon file at "${filePath}": ${(err as Error).message}`
    );
  }
  if (!isImageBuffer(buf)) {
    throw new Error(`Icon file at "${filePath}" is not a PNG or JPEG.`);
  }
  const sha = createHash('sha1').update(new Uint8Array(buf)).digest('hex');
  return { buf, sha };
}

/**
 * Uploads a previously prepared icon buffer to the Vercel avatar service.
 *
 * Notes:
 * - `client.fetch({ json: false })` still THROWS on non-ok responses; the
 *   thrown error is an `APIError` with `serverMessage`. We surface that
 *   message so the caller can present a useful error.
 */
export async function uploadConnexIcon(
  client: Client,
  prepared: PreparedIcon
): Promise<string> {
  try {
    await client.fetch<unknown>('/v2/files', {
      method: 'POST',
      json: false,
      body: prepared.buf,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(prepared.buf.byteLength),
        'x-now-digest': prepared.sha,
        'x-now-size': String(prepared.buf.byteLength),
      },
    });
  } catch (err) {
    const e = err as { serverMessage?: string; message: string };
    throw new Error(`Failed to upload icon: ${e.serverMessage ?? e.message}`);
  }
  return prepared.sha;
}
