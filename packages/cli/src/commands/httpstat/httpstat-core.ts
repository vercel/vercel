import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

export interface HttpstatTiming {
  begin: number;
  dnsLookup: number;
  tcpConnect: number;
  sslHandshake: number;
  serverProcessing: number;
  contentTransfer: number;
  total: number;
}

export interface HttpstatResult {
  url: URL;
  response: {
    httpVersion: string;
    statusCode: number;
    statusMessage: string;
    headers: Record<string, string>;
    body: string;
  };
  timing: HttpstatTiming;
  stats: {
    dnsLookupDuration: number;
    tcpConnectionDuration: number;
    sslHandshakeDuration: number;
    serverProcessingDuration: number;
    contentTransferDuration: number;
    totalDuration: number;
  };
}

export interface HttpstatOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  followRedirects?: boolean;
  maxRedirects?: number;
  rejectUnauthorized?: boolean;
}

export class HttpstatError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'HttpstatError';
  }
}

export async function httpstat(
  url: string,
  options: HttpstatOptions = {}
): Promise<HttpstatResult> {
  const parsedUrl = new URL(url);
  const isHttps = parsedUrl.protocol === 'https:';
  const client = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const timing: Partial<HttpstatTiming> = {};
    const stats: Partial<HttpstatResult['stats']> = {};

    timing.begin = Date.now();

    const requestOptions: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 30000,
      rejectUnauthorized: options.rejectUnauthorized !== false,
    };

    const req = client.request(requestOptions, res => {
      // Mark server processing complete when we get first response
      if (!timing.serverProcessing) {
        timing.serverProcessing = Date.now();
      }

      let responseBody = '';

      res.on('data', chunk => {
        if (!timing.contentTransfer) {
          timing.contentTransfer = Date.now();
        }
        responseBody += chunk.toString();
      });

      res.on('end', () => {
        timing.total = Date.now();

        // Calculate durations
        stats.dnsLookupDuration =
          (timing.dnsLookup || timing.begin) - timing.begin;
        stats.tcpConnectionDuration =
          (timing.tcpConnect || timing.dnsLookup || timing.begin) -
          (timing.dnsLookup || timing.begin);
        stats.sslHandshakeDuration = isHttps
          ? (timing.sslHandshake ||
              timing.tcpConnect ||
              timing.dnsLookup ||
              timing.begin) -
            (timing.tcpConnect || timing.dnsLookup || timing.begin)
          : 0;
        stats.serverProcessingDuration =
          (timing.serverProcessing || timing.total) -
          (timing.sslHandshake ||
            timing.tcpConnect ||
            timing.dnsLookup ||
            timing.begin);
        stats.contentTransferDuration =
          (timing.contentTransfer || timing.total) -
          (timing.serverProcessing || timing.total);
        stats.totalDuration = timing.total - timing.begin;

        resolve({
          url: parsedUrl,
          response: {
            httpVersion: res.httpVersion,
            statusCode: res.statusCode || 0,
            statusMessage: res.statusMessage || '',
            headers: res.headers as Record<string, string>,
            body: responseBody,
          },
          timing: timing as HttpstatTiming,
          stats: stats as HttpstatResult['stats'],
        });
      });
    });

    // Set up socket event listeners for timing
    req.on('socket', socket => {
      socket.on('lookup', () => {
        timing.dnsLookup = Date.now();
      });

      socket.on('connect', () => {
        timing.tcpConnect = Date.now();
      });

      if (isHttps) {
        socket.on('secureConnect', () => {
          timing.sslHandshake = Date.now();
        });
      }
    });

    req.on('error', error => {
      reject(new HttpstatError(`Request failed: ${error.message}`, error.code));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new HttpstatError('Request timeout', 'TIMEOUT'));
    });

    // Write body if provided
    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}
