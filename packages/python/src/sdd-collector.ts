import { createHash } from 'crypto';
import http, { type IncomingMessage, type ServerResponse } from 'http';
import { Readable } from 'stream';
import { debug, NowBuildError } from '@vercel/build-utils';

const SDD_POINT_IN_TIME_ID_HEADER = 'x-vercel-sdd-point-in-time-id';
const PYPI_FILES_PREFIX = 'https://files.pythonhosted.org/packages/';
const LOCAL_HOST = '127.0.0.1';
const LOCAL_PATH_PREFIX = '/v1/packages/pypi';
const SIMPLE_PATH_PREFIX = `${LOCAL_PATH_PREFIX}/simple`;
const PACKAGES_PATH_PREFIX = `${LOCAL_PATH_PREFIX}/packages`;

export interface PyPiSddCollector {
  readonly url: string;
  readonly packageUrlBase: string;
  readonly env: NodeJS.ProcessEnv;
  getStoragePointInTimeId(): string | undefined;
  waitForMetadata(): Promise<void>;
  close(): Promise<void>;
}

export async function startPyPiSddCollector(
  upstreamSimpleUrl: string,
  region?: string
): Promise<PyPiSddCollector> {
  const collector = new LocalPyPiSddCollector(upstreamSimpleUrl, region);
  await collector.start();
  return collector;
}

export function getPyPiProxyBaseUrl(simpleUrl: string): string {
  const trimmed = simpleUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/simple')
    ? trimmed.slice(0, -'/simple'.length)
    : trimmed;
}

class LocalPyPiSddCollector implements PyPiSddCollector {
  private readonly upstreamBaseUrl: string;
  private readonly region: string | undefined;
  private readonly server: http.Server;
  private storagePointInTimeId: string | undefined;
  private pendingMetadata = new Set<Promise<void>>();
  private localBaseUrl: string | undefined;

  constructor(upstreamSimpleUrl: string, region?: string) {
    this.upstreamBaseUrl = getPyPiProxyBaseUrl(upstreamSimpleUrl);
    this.region = region?.trim() || undefined;
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch(error => {
        debug(
          `Shared deps: local PyPI collector request failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        if (!res.headersSent) {
          res.statusCode = 502;
        }
        res.end('PyPI collector request failed');
      });
    });
  }

  get url(): string {
    if (!this.localBaseUrl) throw new Error('collector not started');
    return `${this.localBaseUrl}${SIMPLE_PATH_PREFIX}`;
  }

  get packageUrlBase(): string {
    if (!this.localBaseUrl) throw new Error('collector not started');
    return `${this.localBaseUrl}${LOCAL_PATH_PREFIX}`;
  }

  get env(): NodeJS.ProcessEnv {
    return {
      PIP_INDEX_URL: this.url,
      PIP_TRUSTED_HOST: LOCAL_HOST,
      PIP_NO_CACHE_DIR: '1',
      UV_INDEX_URL: this.url,
      UV_INSECURE_HOST: LOCAL_HOST,
      UV_NO_CACHE: '1',
    };
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, LOCAL_HOST, () => {
        this.server.off('error', reject);
        resolve();
      });
    });

    const address = this.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('could not resolve local PyPI collector address');
    }
    this.localBaseUrl = `http://${LOCAL_HOST}:${address.port}`;
    debug(
      `Shared deps: local PyPI collector listening at ${this.localBaseUrl}`
    );
  }

  getStoragePointInTimeId(): string | undefined {
    return this.storagePointInTimeId;
  }

  async waitForMetadata(): Promise<void> {
    while (this.pendingMetadata.size > 0) {
      await Promise.all([...this.pendingMetadata]);
    }
  }

  async close(): Promise<void> {
    await this.waitForMetadata();
    await new Promise<void>((resolve, reject) => {
      this.server.close(error => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    if (!this.localBaseUrl) {
      res.statusCode = 503;
      res.end('PyPI collector not ready');
      return;
    }

    const url = new URL(req.url ?? '/', this.localBaseUrl);
    if (url.pathname.startsWith(`${SIMPLE_PATH_PREFIX}/`)) {
      await this.handleSimpleIndex(req, res, url);
      return;
    }
    if (url.pathname.startsWith(`${PACKAGES_PATH_PREFIX}/`)) {
      await this.handlePackage(req, res, url);
      return;
    }

    res.statusCode = 404;
    res.end('Not found');
  }

  private async handleSimpleIndex(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): Promise<void> {
    const upstreamUrl = `${this.upstreamBaseUrl}${url.pathname.slice(
      LOCAL_PATH_PREFIX.length
    )}${url.search}`;
    const response = await fetch(upstreamUrl, {
      headers: copyRequestHeaders(req),
    });
    const body = await response.text();
    const rewritten = Buffer.from(
      rewriteSimpleIndexBody(body, this.localBaseUrl!)
    );

    res.statusCode = response.status;
    copyResponseHeaders(response, res, ['content-length', 'etag']);
    res.setHeader('content-length', String(rewritten.byteLength));
    res.setHeader('etag', quotedSha256(rewritten));
    res.end(rewritten);
  }

  private async handlePackage(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): Promise<void> {
    const filepath = decodeURIComponent(
      url.pathname.slice(`${PACKAGES_PATH_PREFIX}/`.length)
    );
    const upstreamUrl = `${this.upstreamBaseUrl}${url.pathname.slice(
      LOCAL_PATH_PREFIX.length
    )}${url.search}`;
    const response = await fetch(upstreamUrl, {
      headers: copyRequestHeaders(req),
      redirect: 'manual',
    });

    this.recordPointInTimeId(response.headers.get(SDD_POINT_IN_TIME_ID_HEADER));

    res.statusCode = response.status;
    copyResponseHeaders(response, res);

    const shouldCollectMetadata =
      isSddWheelArtifact(filepath) &&
      response.ok &&
      !response.headers.get(SDD_POINT_IN_TIME_ID_HEADER);

    if (!response.body) {
      res.end();
      if (shouldCollectMetadata) this.collectMetadata(upstreamUrl);
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const stream = Readable.fromWeb(response.body as any);
      stream.on('end', resolve);
      stream.on('error', reject);
      res.on('error', reject);
      stream.pipe(res);
    });

    if (shouldCollectMetadata) this.collectMetadata(upstreamUrl);
  }

  private collectMetadata(upstreamUrl: string): void {
    const promise = this.fetchMetadata(upstreamUrl).finally(() => {
      this.pendingMetadata.delete(promise);
    });
    this.pendingMetadata.add(promise);
  }

  private async fetchMetadata(metadataUrl: string): Promise<void> {
    const response = await fetch(metadataUrl, { method: 'HEAD' });
    if (response.status === 404) return;
    if (response.status >= 500) {
      throw new NowBuildError({
        code: 'PYTHON_SDD_METADATA_UNAVAILABLE',
        message: `Failed to read Python SDD artifact metadata: ${response.status}`,
      });
    }
    if (!response.ok) return;

    this.recordPointInTimeId(response.headers.get(SDD_POINT_IN_TIME_ID_HEADER));
  }

  private recordPointInTimeId(value: string | null): void {
    const pointInTimeId = this.pointInTimeIdForRegion(value);
    if (!pointInTimeId) return;
    if (
      !this.storagePointInTimeId ||
      pointInTimeId > this.storagePointInTimeId
    ) {
      this.storagePointInTimeId = pointInTimeId;
    }
  }

  private pointInTimeIdForRegion(value: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith('{')) return trimmed;

    try {
      const decoded = JSON.parse(trimmed) as unknown;
      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
        return null;
      }
      const pointInTimeIdMap = decoded as Record<string, unknown>;
      const localPointInTimeId = this.region
        ? pointInTimeIdMap[this.region]
        : undefined;
      if (typeof localPointInTimeId === 'string') {
        return localPointInTimeId;
      }
      const values = Object.values(pointInTimeIdMap).filter(
        (item): item is string => typeof item === 'string'
      );
      return values.length === 1 ? values[0] : null;
    } catch {
      return null;
    }
  }
}

function copyRequestHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (name.toLowerCase() === 'host') continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

function copyResponseHeaders(
  response: Response,
  res: ServerResponse,
  omit: string[] = []
): void {
  const omitted = new Set([
    'content-encoding',
    'transfer-encoding',
    ...omit.map(name => name.toLowerCase()),
  ]);
  for (const [name, value] of response.headers) {
    if (!omitted.has(name.toLowerCase())) {
      res.setHeader(name, value);
    }
  }
}

function rewriteSimpleIndexBody(body: string, localBaseUrl: string): string {
  return body
    .replaceAll(PYPI_FILES_PREFIX, `${localBaseUrl}${PACKAGES_PATH_PREFIX}/`)
    .replaceAll(
      `"${PACKAGES_PATH_PREFIX}/`,
      `"${localBaseUrl}${PACKAGES_PATH_PREFIX}/`
    );
}

function isSddWheelArtifact(filepath: string): boolean {
  return filepath.endsWith('.whl') && !filepath.endsWith('.whl.metadata');
}

function quotedSha256(buffer: Buffer): string {
  return `"${createHash('sha256').update(new Uint8Array(buffer)).digest('base64url')}"`;
}
