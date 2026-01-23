import dns from 'node:dns';
import tls from 'node:tls';
import http from 'node:http';
import http2 from 'node:http2';

import output from '../../output-manager';

// Configuration
const TARGET_HOST = process.env.TUNNEL_SERVER_HOST || 'vercel.com';
const TARGET_PORT = process.env.TUNNEL_SERVER_PORT
  ? parseInt(process.env.TUNNEL_SERVER_PORT, 10)
  : 443;
const SNI_HOSTNAME = 'init.vercel.tube';

// Track connection state to avoid duplicate "connected" messages
let isConnected = false;

/**
 * Decode headers from the vc-tunnel-req-headers format.
 * Format: base64(key):base64(value);base64(key):base64(value);...
 */
function decodeHeadersString(
  headersStr: string | string[] | undefined
): Record<string, string> {
  if (!headersStr || Array.isArray(headersStr)) return {};

  const headers: Record<string, string> = {};
  const pairs = headersStr.split(';');

  for (const pair of pairs) {
    if (!pair) continue;
    const [keyB64, valueB64] = pair.split(':');
    if (!keyB64 || valueB64 === undefined) continue;

    try {
      const key = Buffer.from(keyB64, 'base64').toString('utf-8');
      const value = Buffer.from(valueB64, 'base64').toString('utf-8');
      headers[key] = value;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      output.debug(`Failed to decode header pair: ${pair} ${message}`);
    }
  }

  return headers;
}

/**
 * Encode headers to the vc-tunnel-res-headers format.
 * Format: base64(key):base64(value);base64(key):base64(value);...
 */
function encodeHeadersString(headers: http.IncomingHttpHeaders): string {
  const pairs: string[] = [];

  for (const [key, value] of Object.entries(headers)) {
    // Skip HTTP/2 pseudo-headers and connection-specific headers
    if (key.startsWith(':')) continue;
    if (
      ['connection', 'transfer-encoding', 'keep-alive'].includes(
        key.toLowerCase()
      )
    )
      continue;

    const keyB64 = Buffer.from(key).toString('base64');
    const valueB64 = Buffer.from(String(value)).toString('base64');
    pairs.push(`${keyB64}:${valueB64}`);
  }

  return pairs.join(';');
}

/**
 * Forward an HTTP/2 request to the local dev server via HTTP/1.1
 * Uses the vc-tunnel-req-headers format for request headers
 * Uses the vc-tunnel-res-headers format for response headers
 */
function forwardToLocalServer(
  localIp: string,
  localPort: number,
  stream: http2.ServerHttp2Stream,
  headers: http2.IncomingHttpHeaders
) {
  const path = headers[':path'] || '/';
  const method = headers[':method'] || 'GET';
  const startTime = Date.now();

  // Collect request body
  const bodyChunks: Uint8Array[] = [];
  stream.on('data', (chunk: Uint8Array) => bodyChunks.push(chunk));

  stream.on('end', () => {
    const body = Buffer.concat(bodyChunks);

    // Decode headers from vc-tunnel-req-headers (base64 encoded format)
    const encodedHeaders = headers['vc-tunnel-req-headers'];
    const decodedHeaders = decodeHeadersString(encodedHeaders);

    // Build headers for the local request
    // Start with decoded headers, then add any direct headers that aren't tunnel-specific
    const reqHeaders: http.OutgoingHttpHeaders = { ...decodedHeaders };
    for (const [key, value] of Object.entries(headers)) {
      // Skip HTTP/2 pseudo-headers and tunnel-specific headers
      if (key.startsWith(':')) continue;
      if (key.startsWith('vc-tunnel-')) continue;
      // Only add if not already present from decoded headers
      if (!reqHeaders[key]) {
        reqHeaders[key] = value;
      }
    }

    // Make request to local dev server
    const req = http.request(
      {
        hostname: localIp,
        port: localPort,
        path: path,
        method: method,
        headers: reqHeaders,
      },
      res => {
        const duration = Date.now() - startTime;
        output.log(`${method} ${path} ${res.statusCode} ${duration}ms`);

        // Encode response headers using the vc-tunnel-res-headers format
        const encodedResHeaders = encodeHeadersString(res.headers);

        // Send response back through the tunnel with encoded headers
        const responseHeaders: http2.OutgoingHttpHeaders = {
          ':status': res.statusCode,
          'vc-tunnel-res-headers': encodedResHeaders,
          'vc-tunnel-res-source': 'origin', // Response came from the user's application
        };

        stream.respond(responseHeaders);

        // Stream the response body
        res.on('data', chunk => stream.write(chunk));
        res.on('end', () => stream.end());
        res.on('error', err => {
          output.debug(`Error streaming response: ${err.message}`);
          stream.close(http2.constants.NGHTTP2_INTERNAL_ERROR);
        });
      }
    );

    req.on('error', err => {
      const duration = Date.now() - startTime;
      output.log(`${method} ${path} 502 ${duration}ms`);
      output.debug(`Local dev server error: ${err.message}`);
      stream.respond({
        ':status': 502,
        'content-type': 'text/plain',
        'vc-tunnel-res-source': 'tunnel', // Error response from tunnel itself
      });
      stream.end(`Failed to connect to local dev server: ${err.message}`);
    });

    // Send request body if present
    if (body.length > 0) {
      req.write(body);
    }
    req.end();
  });

  stream.on('error', err => {
    output.debug(`Stream error: ${err.message}`);
  });
}

/**
 * Handle system requests (denoted by vc-tunnel-system: true header)
 * The /system endpoint is a bidirectional JSON-RPC channel:
 * 1. tunneld sends POST /system and keeps the stream open
 * 2. CLI sends JSON-RPC "init" request with tunnel_name and oidc_token
 * 3. tunneld responds with acknowledgement
 */
function handleSystemRequest(
  tunnelName: string,
  oidcToken: string,
  localIp: string,
  localPort: number,
  stream: http2.ServerHttp2Stream,
  headers: http2.IncomingHttpHeaders
) {
  const path = headers[':path'];

  if (path === '/ping') {
    output.debug('Received ping from tunneld');
    stream.respond({ ':status': 200, 'content-type': 'text/plain' });
    stream.end('pong');
    return;
  }

  if (path !== '/system') {
    output.debug(`Unknown system endpoint: ${path}`);
    stream.respond({ ':status': 404, 'content-type': 'text/plain' });
    stream.end('Unknown system endpoint');
    return;
  }

  output.debug('System channel opened, sending init request...');

  // Respond with 200 to keep the stream open for bidirectional communication
  stream.respond({
    ':status': 200,
    'content-type': 'application/json',
  });

  // Send the init request to tunneld
  const initRequest = {
    jsonrpc: '2.0',
    method: 'init',
    id: 1,
    params: {
      tunnel_name: tunnelName,
      oidc_token: oidcToken,
    },
  };

  // Send with newline delimiter (NDJSON format)
  stream.write(JSON.stringify(initRequest) + '\n');
  output.debug(`Sent init request with tunnel name: ${tunnelName}`);

  // Read tunneld's response - newline delimited JSON
  let buffer = '';
  stream.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();

    // Process complete lines
    let newlineIdx;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);

      if (!line.trim()) continue;

      try {
        const rpcResp = JSON.parse(line);

        if (rpcResp.error) {
          output.error(`Tunnel error: ${JSON.stringify(rpcResp.error)}`);
          continue;
        }

        // Handle init response
        if (rpcResp.id === 1) {
          reconnectAttempts = 0;
          if (!isConnected) {
            isConnected = true;
            output.log(
              `Tunnel connected - send requests with x-vercel-tunnel: ${tunnelName}`
            );
            output.log(`Forwarding to http://${localIp}:${localPort}\n`);
          }
        } else {
          output.debug(`Received system message: ${JSON.stringify(rpcResp)}`);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        output.debug(`Failed to parse JSON-RPC message: ${message}`);
      }
    }
  });

  stream.on('end', () => {
    output.debug('System channel closed by tunneld');
  });

  stream.on('error', err => {
    output.debug(`System channel error: ${err.message}`);
  });
}

/**
 * Handle incoming HTTP/2 requests from tunneld
 */
function handleRequest(
  tunnelName: string,
  oidcToken: string,
  localIp: string,
  localPort: number,
  stream: http2.ServerHttp2Stream,
  headers: http2.IncomingHttpHeaders
) {
  const isSystemRequest = headers['vc-tunnel-system'] === 'true';

  // System requests are handled separately (bidirectional JSON-RPC channel)
  if (isSystemRequest) {
    handleSystemRequest(
      tunnelName,
      oidcToken,
      localIp,
      localPort,
      stream,
      headers
    );
    return;
  }

  // Forward all other requests to the local dev server
  forwardToLocalServer(localIp, localPort, stream, headers);
}

let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000;

function reconnect(
  tunnelName: string,
  oidcToken: string,
  localIp: string,
  localPort: number
) {
  reconnectAttempts++;
  const delay = Math.min(
    1000 * Math.pow(2, reconnectAttempts - 1),
    MAX_RECONNECT_DELAY
  );
  output.log(
    `Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts})...`
  );

  setTimeout(() => {
    connect(tunnelName, oidcToken, localIp, localPort);
  }, delay);
}

/**
 * Establish tunnel connection
 */
export async function connect(
  tunnelName: string,
  oidcToken: string,
  localIp: string,
  localPort: number
) {
  output.log(`Establishing tunnel: ${tunnelName}`);
  output.debug(`Forwarding to http://${localIp}:${localPort}`);
  output.debug(`Connecting to ${TARGET_HOST}:${TARGET_PORT}`);

  let targetIP: string;
  try {
    const { address } = await dns.promises.lookup(TARGET_HOST);
    targetIP = address;
    output.debug(`Resolved ${TARGET_HOST} to ${targetIP}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    output.error(`DNS resolution failed: ${message}`);
    reconnect(tunnelName, oidcToken, localIp, localPort);
    return;
  }

  const socket = tls.connect({
    host: targetIP,
    port: TARGET_PORT,
    servername: SNI_HOSTNAME,
    ALPNProtocols: ['h2'],
    requestCert: true,
  });

  socket.once('secureConnect', () => {
    output.debug('TLS connection established');

    // Upgrade the TLS socket into an HTTP/2 Server session
    // This makes us act as an HTTP/2 SERVER, so tunneld (the client) can send us requests
    const session: http2.ServerHttp2Session = http2.performServerHandshake(
      socket,
      {
        settings: {
          enablePush: false,
          maxConcurrentStreams: 1000,
        },
      }
    );

    output.debug('HTTP/2 server session established');

    session.on('stream', (stream, headers) =>
      handleRequest(tunnelName, oidcToken, localIp, localPort, stream, headers)
    );

    session.on('close', () => {
      output.debug('Session closed');
      reconnect(tunnelName, oidcToken, localIp, localPort);
    });

    session.on('error', err => {
      output.debug(`Session error: ${err.message}`);
    });

    session.on('goaway', (errorCode, lastStreamID) => {
      output.debug(
        `GOAWAY: errorCode=${errorCode}, lastStreamID=${lastStreamID}`
      );
    });

    socket.on('error', err => {
      output.debug(`Socket error: ${err.message}`);
    });

    socket.on('close', () => {
      output.debug('Socket closed');
    });
  });

  socket.on('error', err => {
    output.error(`Connection failed: ${err.message}`);
    reconnect(tunnelName, oidcToken, localIp, localPort);
  });

  return socket;
}
