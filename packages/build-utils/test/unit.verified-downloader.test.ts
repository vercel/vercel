import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'crypto';
import { createServer, Server } from 'http';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AddressInfo } from 'net';
import { VerifiedDownloader, NowBuildError } from '../src';

const PAYLOAD = Buffer.from('hello-verified-downloader');
const PAYLOAD_SHA256 = createHash('sha256').update(PAYLOAD).digest('hex');

interface TestServerHandle {
  server: Server;
  baseUrl: string;
}

async function startServer(): Promise<TestServerHandle> {
  let responder: ((req: unknown, res: any) => void) | null = null;
  const server = createServer((req, res) => {
    if (responder) {
      responder(req, res);
      return;
    }
    res.writeHead(500);
    res.end();
  });
  server.on('__setResponder', (fn: (req: unknown, res: any) => void) => {
    responder = fn;
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { address, port } = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://${address}:${port}`,
  };
}

describe('VerifiedDownloader', () => {
  let handle: TestServerHandle;
  let tmpDir: string;

  beforeAll(async () => {
    handle = await startServer();
    tmpDir = await fs.mkdtemp(join(tmpdir(), 'verified-downloader-test-'));
  });

  afterAll(async () => {
    await new Promise<void>(resolve => handle.server.close(() => resolve()));
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function setResponder(fn: (req: unknown, res: any) => void) {
    handle.server.emit('__setResponder', fn);
  }

  it('rejects construction with an invalid SHA-256', () => {
    expect(() => new VerifiedDownloader({ sha256: 'not-hex' })).toThrow(
      NowBuildError
    );
    expect(
      () => new VerifiedDownloader({ sha256: PAYLOAD_SHA256.toUpperCase() })
    ).toThrow(NowBuildError);
  });

  it('rejects construction when neither sha256 nor sha256Url is provided', () => {
    expect(() => new VerifiedDownloader({})).toThrow(NowBuildError);
  });

  it('rejects construction when both sha256 and sha256Url are provided', () => {
    expect(
      () =>
        new VerifiedDownloader({
          sha256: PAYLOAD_SHA256,
          sha256Url: 'http://example.com/sha',
          parseSha256: () => undefined,
        })
    ).toThrow(NowBuildError);
  });

  it('rejects construction when sha256Url is provided without parseSha256', () => {
    expect(
      () =>
        new VerifiedDownloader({
          sha256Url: 'http://example.com/sha',
        })
    ).toThrow(NowBuildError);
  });

  it('rejects non-positive maxBytes / timeoutMs', () => {
    expect(
      () => new VerifiedDownloader({ sha256: PAYLOAD_SHA256, maxBytes: 0 })
    ).toThrow(NowBuildError);
    expect(
      () => new VerifiedDownloader({ sha256: PAYLOAD_SHA256, timeoutMs: -1 })
    ).toThrow(NowBuildError);
  });

  it('downloads to the destination when the sha matches', async () => {
    setResponder((_req, res) => {
      res.writeHead(200, { 'content-length': String(PAYLOAD.length) });
      res.end(PAYLOAD);
    });

    const dest = join(tmpDir, 'ok.bin');
    const downloader = new VerifiedDownloader({ sha256: PAYLOAD_SHA256 });
    await downloader.downloadTo(`${handle.baseUrl}/ok`, dest);

    const written = await fs.readFile(dest);
    expect(written.equals(PAYLOAD)).toBe(true);
  });

  it('throws and cleans up on SHA mismatch', async () => {
    setResponder((_req, res) => {
      res.writeHead(200, { 'content-length': String(PAYLOAD.length) });
      res.end(PAYLOAD);
    });

    const dest = join(tmpDir, 'mismatch.bin');
    const wrongSha = 'a'.repeat(64);
    const downloader = new VerifiedDownloader({ sha256: wrongSha });

    await expect(
      downloader.downloadTo(`${handle.baseUrl}/mismatch`, dest)
    ).rejects.toMatchObject({
      code: 'VERIFIED_DOWNLOADER_SHA256_MISMATCH',
    });

    await expect(fs.access(dest)).rejects.toThrow();
  });

  it('throws on non-2xx HTTP status', async () => {
    setResponder((_req, res) => {
      res.writeHead(404, 'Not Found');
      res.end('nope');
    });

    const dest = join(tmpDir, '404.bin');
    const downloader = new VerifiedDownloader({ sha256: PAYLOAD_SHA256 });
    await expect(
      downloader.downloadTo(`${handle.baseUrl}/missing`, dest)
    ).rejects.toMatchObject({ code: 'VERIFIED_DOWNLOADER_HTTP_ERROR' });
  });

  it('refuses to download bodies that exceed maxBytes', async () => {
    setResponder((_req, res) => {
      const big = Buffer.alloc(32, 0x41);
      res.writeHead(200, { 'content-length': String(big.length) });
      res.end(big);
    });

    const dest = join(tmpDir, 'big.bin');
    const downloader = new VerifiedDownloader({
      sha256: PAYLOAD_SHA256,
      maxBytes: 8,
    });

    await expect(
      downloader.downloadTo(`${handle.baseUrl}/big`, dest)
    ).rejects.toMatchObject({ code: 'VERIFIED_DOWNLOADER_TOO_LARGE' });
  });

  it('aborts when streamed bytes exceed maxBytes even without content-length', async () => {
    setResponder((_req, res) => {
      res.writeHead(200);
      res.write(Buffer.alloc(4, 0x41));
      res.write(Buffer.alloc(16, 0x42));
      res.end();
    });

    const dest = join(tmpDir, 'stream-big.bin');
    const downloader = new VerifiedDownloader({
      sha256: PAYLOAD_SHA256,
      maxBytes: 8,
    });

    await expect(
      downloader.downloadTo(`${handle.baseUrl}/stream-big`, dest)
    ).rejects.toBeDefined();
  });

  it('fetches the SHA-256 dynamically from sha256Url and downloads successfully', async () => {
    // Serve both the shasums file and the binary from one responder,
    // dispatching by request URL.
    setResponder((req: any, res: any) => {
      if (req.url.endsWith('/SHASUMS256.txt')) {
        const body =
          `deadbeef${'0'.repeat(56)}  other-file.zip\n` +
          `${PAYLOAD_SHA256}  binary.zip\n`;
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end(body);
        return;
      }
      res.writeHead(200, { 'content-length': String(PAYLOAD.length) });
      res.end(PAYLOAD);
    });

    const dest = join(tmpDir, 'remote-sha-ok.bin');
    const downloader = new VerifiedDownloader({
      sha256Url: `${handle.baseUrl}/SHASUMS256.txt`,
      parseSha256: body => {
        for (const line of body.split('\n')) {
          const [sha, name] = line.trim().split(/\s+/);
          if (name === 'binary.zip') return sha;
        }
        return undefined;
      },
    });
    await downloader.downloadTo(`${handle.baseUrl}/binary.zip`, dest);

    const written = await fs.readFile(dest);
    expect(written.equals(PAYLOAD)).toBe(true);
  });

  it('throws VERIFIED_DOWNLOADER_SHA256_NOT_FOUND when parseSha256 returns undefined', async () => {
    setResponder((_req: any, res: any) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('nothing matching here\n');
    });

    const dest = join(tmpDir, 'remote-sha-missing.bin');
    const downloader = new VerifiedDownloader({
      sha256Url: `${handle.baseUrl}/SHASUMS256.txt`,
      parseSha256: () => undefined,
    });
    await expect(
      downloader.downloadTo(`${handle.baseUrl}/binary.zip`, dest)
    ).rejects.toMatchObject({
      code: 'VERIFIED_DOWNLOADER_SHA256_NOT_FOUND',
    });
  });

  it('throws VERIFIED_DOWNLOADER_SHA256_NOT_FOUND when parseSha256 returns a malformed value', async () => {
    setResponder((_req: any, res: any) => {
      res.writeHead(200);
      res.end('some content');
    });

    const dest = join(tmpDir, 'remote-sha-bad.bin');
    const downloader = new VerifiedDownloader({
      sha256Url: `${handle.baseUrl}/SHASUMS256.txt`,
      parseSha256: () => 'not-a-valid-hex-digest',
    });
    await expect(
      downloader.downloadTo(`${handle.baseUrl}/binary.zip`, dest)
    ).rejects.toMatchObject({
      code: 'VERIFIED_DOWNLOADER_SHA256_NOT_FOUND',
    });
  });

  it('throws VERIFIED_DOWNLOADER_SHA256_FETCH_FAILED when sha256Url returns non-2xx', async () => {
    setResponder((_req: any, res: any) => {
      res.writeHead(500, 'Server Error');
      res.end('boom');
    });

    const dest = join(tmpDir, 'remote-sha-500.bin');
    const downloader = new VerifiedDownloader({
      sha256Url: `${handle.baseUrl}/SHASUMS256.txt`,
      parseSha256: () => PAYLOAD_SHA256,
    });
    await expect(
      downloader.downloadTo(`${handle.baseUrl}/binary.zip`, dest)
    ).rejects.toMatchObject({
      code: 'VERIFIED_DOWNLOADER_SHA256_FETCH_FAILED',
    });
  });
});
