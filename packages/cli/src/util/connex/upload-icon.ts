import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type Client from '../client';

/**
 * Magic-byte preflight: the `/v2/files` endpoint does not validate image
 * format and `resolveConnexIcon` only logs format-validation failures (it
 * still stores the SHA). So uploading a non-image would succeed silently and
 * surface as a broken icon in the dashboard. Reject early at the CLI layer.
 */
function isImageBuffer(buf: Buffer): boolean {
  // PNG: 89 50 4E 47
  if (
    buf.length >= 4 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return true;
  }
  // JPEG: FF D8 FF
  if (
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    return true;
  }
  return false;
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
 * Throws a user-facing error if the file is unreadable or is not a PNG/JPEG.
 */
export async function prepareConnexIcon(
  filePath: string
): Promise<PreparedIcon> {
  let buf: Buffer;
  try {
    buf = await readFile(filePath);
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
