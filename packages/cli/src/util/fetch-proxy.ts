import { Agent, ProxyAgent, type Dispatcher } from 'undici';

const DEFAULT_PORTS: Record<string, number> = {
  'http:': 80,
  'https:': 443,
};

function getEnv(name: string): string | undefined {
  return process.env[name.toLowerCase()] || process.env[name.toUpperCase()];
}

function normalizeProxyUrl(value: string): string {
  const proxyUrl = value.includes('://') ? value : `http://${value}`;
  const protocol = new URL(proxyUrl).protocol;

  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new TypeError(`Unsupported proxy protocol: ${protocol}`);
  }

  return proxyUrl;
}

interface NoProxyEntry {
  hostname: string;
  port: number;
}

type ProxyDispatcher = Pick<Dispatcher, 'dispatch' | 'close' | 'destroy'>;

export interface EnvProxyDispatcherOptions {
  directAgent?: ProxyDispatcher;
  createProxyAgent?: (url: string) => ProxyDispatcher;
}

export class EnvProxyDispatcher {
  private readonly directAgent: ProxyDispatcher;
  private readonly httpAgent: ProxyDispatcher;
  private readonly httpsAgent: ProxyDispatcher;
  private noProxyValue = '';
  private noProxyEntries: NoProxyEntry[] = [];

  constructor(options: EnvProxyDispatcherOptions = {}) {
    const createProxyAgent =
      options.createProxyAgent || ((url: string) => new ProxyAgent(url));
    const allProxy = getEnv('all_proxy');
    const httpProxy = getEnv('http_proxy') || allProxy;
    const httpsProxy = getEnv('https_proxy') || httpProxy || allProxy;

    this.directAgent = options.directAgent || new Agent();
    this.httpAgent = httpProxy
      ? createProxyAgent(normalizeProxyUrl(httpProxy))
      : this.directAgent;
    this.httpsAgent = httpsProxy
      ? createProxyAgent(normalizeProxyUrl(httpsProxy))
      : this.httpAgent;
    this.parseNoProxy();
  }

  dispatch(
    options: Dispatcher.DispatchOptions,
    handler: Dispatcher.DispatchHandlers
  ): boolean {
    const url = new URL(String(options.origin));
    return this.getAgent(url).dispatch(options, handler);
  }

  async close(): Promise<void> {
    await Promise.all([...this.agents()].map(agent => agent.close()));
  }

  async destroy(error?: Error): Promise<void> {
    await Promise.all(
      [...this.agents()].map(agent => agent.destroy(error || null))
    );
  }

  private agents(): Set<ProxyDispatcher> {
    return new Set([this.directAgent, this.httpAgent, this.httpsAgent]);
  }

  private getAgent(url: URL): ProxyDispatcher {
    if (this.noProxyValue !== (getEnv('no_proxy') || '')) {
      this.parseNoProxy();
    }

    const hostname = url.hostname.toLowerCase();
    const port = Number.parseInt(url.port, 10) || DEFAULT_PORTS[url.protocol];

    if (!this.shouldProxy(hostname, port)) {
      return this.directAgent;
    }

    return url.protocol === 'https:' ? this.httpsAgent : this.httpAgent;
  }

  private shouldProxy(hostname: string, port: number): boolean {
    if (this.noProxyEntries.length === 0) {
      return true;
    }

    if (this.noProxyValue === '*') {
      return false;
    }

    for (const entry of this.noProxyEntries) {
      if (entry.port && entry.port !== port) {
        continue;
      }

      if (!entry.hostname.startsWith('.') && !entry.hostname.startsWith('*')) {
        if (hostname === entry.hostname) {
          return false;
        }
      } else if (hostname.endsWith(entry.hostname.replace(/^\*/, ''))) {
        return false;
      }
    }

    return true;
  }

  private parseNoProxy(): void {
    this.noProxyValue = getEnv('no_proxy') || '';
    this.noProxyEntries = this.noProxyValue
      .toLowerCase()
      .split(/[,\s]/)
      .filter(Boolean)
      .map(value => {
        const parsed = value.match(/^(.+):(\d+)$/);
        return {
          hostname: parsed ? parsed[1] : value,
          port: parsed ? Number.parseInt(parsed[2], 10) : 0,
        };
      });
  }
}
