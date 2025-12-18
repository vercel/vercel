import tls from 'node:tls';
import http from 'node:http';
import http2 from 'node:http2';

import output from '../../output-manager';

/**
 * Forward an HTTP/2 request to the local dev server via HTTP/1.1
 */
function forwardToLocalServer(
  localIp: string,
  localPort: number,
  stream: http2.Http2Stream,
  headers: http2.IncomingHttpHeaders
) {
  const path = headers[':path'] || '/';
  const method = headers[':method'] || 'GET';

  output.log(`[tunnel] Forwarding ${method} ${path} to local dev server`);

  // Collect request body
  const bodyChunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => bodyChunks.push(chunk));

  stream.on('end', () => {
    const body = Buffer.concat(bodyChunks);

    // Build headers for the local request
    const reqHeaders: http.OutgoingHttpHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
      // Skip HTTP/2 pseudo-headers
      if (!key.startsWith(':')) {
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
        output.log(`[tunnel] Local server responded with ${res.statusCode}`);

        // Send response back through the tunnel
        const responseHeaders: http2.OutgoingHttpHeaders = {
          ':status': res.statusCode,
        };
        for (const [key, value] of Object.entries(res.headers)) {
          // Skip connection-specific headers
          if (
            !['connection', 'transfer-encoding', 'keep-alive'].includes(
              key.toLowerCase()
            )
          ) {
            responseHeaders[key] = value;
          }
        }

        stream.respond(responseHeaders);

        // Stream the response body
        res.on('data', chunk => stream.write(chunk));
        res.on('end', () => stream.end());
        res.on('error', err => {
          output.error(`[tunnel] Error streaming response:${err.message}`);
          stream.close(http2.constants.NGHTTP2_INTERNAL_ERROR);
        });
      }
    );

    req.on('error', err => {
      output.error(
        '\n[tunnel] Error connecting to local dev server:',
        err.message
      );
      stream.respond({
        ':status': 502,
        'content-type': 'text/plain',
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
    output.error(`[tunnel] Stream error:${err.message}`);
  });
}

/**
 * Handle incoming HTTP/2 requests from tunneld
 */
function handleRequest(
  dplId: string,
  localIp: string,
  localPort: number,
  stream: http2.Http2Stream,
  headers: http2.IncomingHttpHeaders
) {
  const path = headers[':path'];
  const method = headers[':method'];

  output.log(`[tunnel] Received request: ${method} ${path}`);

  // Handle tunnel registration request
  if (path === '/_tunnel/register') {
    output.log('\n[tunnel] Responding to registration request');
    stream.respond({
      ':status': 200,
      'content-type': 'application/json',
    });
    stream.end(JSON.stringify({ tunnel_id: dplId }));
    output.log(`[tunnel] Registered with tunnel ID: ${dplId}`);
    output.log(`[tunnel] Tunnel URL: https://${dplId}.vercel.tube`);
    return;
  }

  // Handle ping/heartbeat requests
  if (path === '/_tunnel/ping') {
    output.log('\n[tunnel] Responding to ping');
    stream.respond({
      ':status': 200,
      'content-type': 'text/plain',
    });
    stream.end('pong');
    return;
  }

  // Handle legacy ping format (for backwards compatibility)
  if (path?.startsWith('/ping/')) {
    const id = path.split('/ping/')[1];
    stream.respond({
      ':status': 200,
      'content-type': 'text/plain',
    });
    stream.end(`pong ${id}`);
    output.log(`[tunnel] Responded to ping ${id}`);
    return;
  }

  // Forward all other requests to the local dev server
  forwardToLocalServer(localIp, localPort, stream, headers);
}

/**
 * Establish tunnel connection
 */
export function connect(dplId: string, localIp: string, localPort: number) {
  output.log('\n[tunnel] Establishing TLS connection...');

  const socket = tls.connect({
    host: '127.0.0.1', // TODO: use vercel.com
    port: 443,
    servername: 'tunnel-init.vercel.app', // TODO: use vercel.com
    ALPNProtocols: ['h2'],
    requestCert: true,
  });

  socket.once('secureConnect', () => {
    output.log('\n[tunnel] TLS connection established');
    output.log(`\n[tunnel] ALPN protocol: ${socket.alpnProtocol}`);
    output.log(
      `\n[tunnel] Connected to: ${socket.remoteAddress}:${socket.remotePort}`
    );

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

    output.log('\n[tunnel] HTTP/2 server session established');
    output.log('\n[tunnel] Waiting for registration request from tunneld...');

    session.on('stream', (stream, headers) =>
      handleRequest(dplId, localIp, localPort, stream, headers)
    );

    session.on('close', () => {
      output.log('\n[tunnel] HTTP/2 session closed');
      reconnect(dplId, localIp, localPort);
    });

    session.on('error', err => {
      output.error(`[tunnel] HTTP/2 session error: ${err.message}`);
    });

    session.on('goaway', (errorCode, lastStreamID) => {
      output.log(
        `\n[tunnel] Received GOAWAY: errorCode=${errorCode}, lastStreamID=${lastStreamID}`
      );
    });

    socket.on('error', err => {
      output.error('[tunnel] Socket error:', err.message);
    });

    socket.on('close', () => {
      output.log('\n[tunnel] Socket closed');
    });
  });

  socket.on('error', err => {
    output.error('[tunnel] Connection error:', err.message);
    reconnect(dplId, localIp, localPort);
  });

  return socket;
}

let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000;

function reconnect(dplId: string, localIp: string, localPort: number) {
  reconnectAttempts++;
  const delay = Math.min(
    1000 * Math.pow(2, reconnectAttempts - 1),
    MAX_RECONNECT_DELAY
  );
  output.log(
    `[tunnel] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`
  );

  setTimeout(() => {
    connect(dplId, localIp, localPort);
  }, delay);
}
