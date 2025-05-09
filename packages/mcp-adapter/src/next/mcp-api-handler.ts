import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  type IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from 'node:http';
import { createClient } from 'redis';
import { Socket } from 'node:net';
import { Readable } from 'node:stream';
import type { ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { BodyType } from './server-response-adapter';
import assert from 'node:assert';

interface SerializedRequest {
  requestId: string;
  url: string;
  method: string;
  body: BodyType;
  headers: IncomingHttpHeaders;
}

type LogLevel = 'log' | 'error' | 'warn' | 'info' | 'debug';

function createLogger(verboseLogs = false) {
  return {
    log: (...args: unknown[]) => {
      if (verboseLogs) console.log(...args);
    },
    error: (...args: unknown[]) => {
      if (verboseLogs) console.error(...args);
    },
    warn: (...args: unknown[]) => {
      if (verboseLogs) console.warn(...args);
    },
    info: (...args: unknown[]) => {
      if (verboseLogs) console.info(...args);
    },
    debug: (...args: unknown[]) => {
      if (verboseLogs) console.debug(...args);
    },
  };
}
/**
 * Configuration for the MCP handler.
 * @property redisUrl - The URL of the Redis instance to use for the MCP handler.
 * @property streamableHttpEndpoint - The endpoint to use for the streamable HTTP transport.
 * @property sseEndpoint - The endpoint to use for the SSE transport.
 * @property verboseLogs - If true, enables console logging.
 */
export type Config = {
  /**
   * The URL of the Redis instance to use for the MCP handler.
   * @default process.env.REDIS_URL || process.env.KV_URL
   */
  redisUrl?: string;
  /**
   * The endpoint to use for the streamable HTTP transport.
   * @deprecated Use `set basePath` instead.
   * @default "/mcp"
   */
  streamableHttpEndpoint?: string;
  /**
   * The endpoint to use for the SSE transport.
   * @deprecated Use `set basePath` instead.
   * @default "/sse"
   */
  sseEndpoint?: string;
  /**
   * The endpoint to use for the SSE messages transport.
   * @deprecated Use `set basePath` instead.
   * @default "/message"
   */
  sseMessageEndpoint?: string;
  /**
   * The maximum duration of an MCP request in seconds.
   * @default 60
   */
  maxDuration?: number;
  /**
   * If true, enables console logging.
   * @default false
   */
  verboseLogs?: boolean;
  /**
   * The base path to use for deriving endpoints.
   * If provided, endpoints will be derived from this path.
   * For example, if basePath is "/", that means your routing is:
   *  /app/[transport]/route.ts and then:
   * - streamableHttpEndpoint will be "/mcp"
   * - sseEndpoint will be "/sse"
   * - sseMessageEndpoint will be "/message"
   * @default ""
   */
  basePath?: string;
};

/**
 * Derives MCP endpoints from a base path.
 * @param basePath - The base path to derive endpoints from
 * @returns An object containing the derived endpoints
 */
function deriveEndpointsFromBasePath(basePath: string): {
  streamableHttpEndpoint: string;
  sseEndpoint: string;
  sseMessageEndpoint: string;
} {
  // Remove trailing slash if present
  const normalizedBasePath = basePath.replace(/\/$/, '');

  return {
    streamableHttpEndpoint: `${normalizedBasePath}/mcp`,
    sseEndpoint: `${normalizedBasePath}/sse`,
    sseMessageEndpoint: `${normalizedBasePath}/message`,
  };
}
/**
 * Calculates the endpoints for the MCP handler.
 * @param config - The configuration for the MCP handler.
 * @returns An object containing the endpoints for the MCP handler.
 */
export function calculateEndpoints({
  basePath,
  streamableHttpEndpoint = '/mcp',
  sseEndpoint = '/sse',
  sseMessageEndpoint = '/message',
}: Config) {
  const {
    streamableHttpEndpoint: fullStreamableHttpEndpoint,
    sseEndpoint: fullSseEndpoint,
    sseMessageEndpoint: fullSseMessageEndpoint,
  } = basePath != null
    ? deriveEndpointsFromBasePath(basePath)
    : {
        streamableHttpEndpoint,
        sseEndpoint,
        sseMessageEndpoint,
      };

  return {
    streamableHttpEndpoint: fullStreamableHttpEndpoint,
    sseEndpoint: fullSseEndpoint,
    sseMessageEndpoint: fullSseMessageEndpoint,
  };
}

export function initializeMcpApiHandler(
  initializeServer: (server: McpServer) => void,
  serverOptions: ServerOptions = {},
  config: Config = {
    redisUrl: process.env.REDIS_URL || process.env.KV_URL,
    streamableHttpEndpoint: '/mcp',
    sseEndpoint: '/sse',
    sseMessageEndpoint: '/message',
    basePath: '',
    maxDuration: 60,
    verboseLogs: false,
  }
) {
  const {
    redisUrl,
    basePath,
    streamableHttpEndpoint: explicitStreamableHttpEndpoint,
    sseEndpoint: explicitSseEndpoint,
    sseMessageEndpoint: explicitSseMessageEndpoint,
    maxDuration,
    verboseLogs,
  } = config;

  // If basePath is provided, derive endpoints from it
  const { streamableHttpEndpoint, sseEndpoint, sseMessageEndpoint } =
    calculateEndpoints({
      basePath,
      streamableHttpEndpoint: explicitStreamableHttpEndpoint,
      sseEndpoint: explicitSseEndpoint,
      sseMessageEndpoint: explicitSseMessageEndpoint,
    });

  const logger = createLogger(verboseLogs);
  const redis = createClient({
    url: redisUrl,
  });
  const redisPublisher = createClient({
    url: redisUrl,
  });
  redis.on('error', err => {
    logger.error('Redis error', err);
  });
  redisPublisher.on('error', err => {
    logger.error('Redis error', err);
  });
  const redisPromise = Promise.all([redis.connect(), redisPublisher.connect()]);

  let servers: McpServer[] = [];

  let statelessServer: McpServer;
  const statelessTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  return async function mcpApiHandler(req: Request, res: ServerResponse) {
    await redisPromise;
    const url = new URL(req.url || '', 'https://example.com');
    if (url.pathname === streamableHttpEndpoint) {
      if (req.method === 'GET') {
        logger.log('Received GET MCP request');
        res.writeHead(405).end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Method not allowed.',
            },
            id: null,
          })
        );
        return;
      }
      if (req.method === 'DELETE') {
        logger.log('Received DELETE MCP request');
        res.writeHead(405).end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Method not allowed.',
            },
            id: null,
          })
        );
        return;
      }

      if (req.method === 'POST') {
        logger.log('Got new MCP connection', req.url, req.method);

        if (!statelessServer) {
          statelessServer = new McpServer(
            {
              name: 'mcp-typescript server on vercel',
              version: '0.1.0',
            },
            serverOptions
          );

          initializeServer(statelessServer);
          await statelessServer.connect(statelessTransport);
        }

        // Parse the request body
        let bodyContent: BodyType;
        const contentType = req.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          bodyContent = await req.json();
        } else {
          bodyContent = await req.text();
        }

        const incomingRequest = createFakeIncomingMessage({
          method: req.method,
          url: req.url,
          headers: Object.fromEntries(req.headers),
          body: bodyContent,
        });
        await statelessTransport.handleRequest(incomingRequest, res);
      }
    } else if (url.pathname === sseEndpoint) {
      logger.log('Got new SSE connection');
      assert(sseMessageEndpoint, 'sseMessageEndpoint is required');
      const transport = new SSEServerTransport(sseMessageEndpoint, res);
      const sessionId = transport.sessionId;
      const server = new McpServer(
        {
          name: 'mcp-typescript server on vercel',
          version: '0.1.0',
        },
        serverOptions
      );
      initializeServer(server);

      servers.push(server);

      server.server.onclose = () => {
        logger.log('SSE connection closed');
        servers = servers.filter(s => s !== server);
      };

      let logs: {
        type: LogLevel;
        messages: string[];
      }[] = [];
      // This ensures that we logs in the context of the right invocation since the subscriber
      // is not itself invoked in request context.

      // eslint-disable-next-line no-inner-declarations
      function logInContext(severity: LogLevel, ...messages: string[]) {
        logs.push({
          type: severity,
          messages,
        });
      }

      // Handles messages originally received via /message
      const handleMessage = async (message: string) => {
        logger.log('Received message from Redis', message);
        logInContext('log', 'Received message from Redis', message);
        const request = JSON.parse(message) as SerializedRequest;

        // Make in IncomingMessage object because that is what the SDK expects.
        const req = createFakeIncomingMessage({
          method: request.method,
          url: request.url,
          headers: request.headers,
          body: request.body, // This could already be an object from earlier parsing
        });
        const syntheticRes = new ServerResponse(req);
        let status = 100;
        let body = '';
        syntheticRes.writeHead = (statusCode: number) => {
          status = statusCode;
          return syntheticRes;
        };
        syntheticRes.end = (b: unknown) => {
          body = b as string;
          return syntheticRes;
        };
        await transport.handlePostMessage(req, syntheticRes);

        await redisPublisher.publish(
          `responses:${sessionId}:${request.requestId}`,
          JSON.stringify({
            status,
            body,
          })
        );

        if (status >= 200 && status < 300) {
          logInContext(
            'log',
            `Request ${sessionId}:${request.requestId} succeeded: ${body}`
          );
        } else {
          logInContext(
            'error',
            `Message for ${sessionId}:${request.requestId} failed with status ${status}: ${body}`
          );
        }
      };

      const interval = setInterval(() => {
        for (const log of logs) {
          logger[log.type](...log.messages);
        }
        logs = [];
      }, 100);

      await redis.subscribe(`requests:${sessionId}`, handleMessage);
      logger.log(`Subscribed to requests:${sessionId}`);

      let timeout: NodeJS.Timeout;
      let resolveTimeout: (value: unknown) => void;
      const waitPromise = new Promise(resolve => {
        resolveTimeout = resolve;
        timeout = setTimeout(
          () => {
            resolve('max duration reached');
          },
          (maxDuration ?? 60) * 1000
        );
      });

      // eslint-disable-next-line no-inner-declarations
      async function cleanup() {
        clearTimeout(timeout);
        clearInterval(interval);
        await redis.unsubscribe(`requests:${sessionId}`, handleMessage);
        logger.log('Done');
        res.statusCode = 200;
        res.end();
      }
      req.signal.addEventListener('abort', () =>
        resolveTimeout('client hang up')
      );

      await server.connect(transport);
      const closeReason = await waitPromise;
      logger.log(closeReason);
      await cleanup();
    } else if (url.pathname === sseMessageEndpoint) {
      logger.log('Received message');

      const body = await req.text();
      let parsedBody: BodyType;
      try {
        parsedBody = JSON.parse(body);
      } catch (e) {
        parsedBody = body;
      }

      const sessionId = url.searchParams.get('sessionId') || '';
      if (!sessionId) {
        res.statusCode = 400;
        res.end('No sessionId provided');
        return;
      }
      const requestId = crypto.randomUUID();
      const serializedRequest: SerializedRequest = {
        requestId,
        url: req.url || '',
        method: req.method || '',
        body: parsedBody,
        headers: Object.fromEntries(req.headers.entries()),
      };

      // Handles responses from the /sse endpoint.
      await redis.subscribe(`responses:${sessionId}:${requestId}`, message => {
        clearTimeout(timeout);
        const response = JSON.parse(message) as {
          status: number;
          body: string;
        };
        res.statusCode = response.status;
        res.end(response.body);
      });

      // Queue the request in Redis so that a subscriber can pick it up.
      // One queue per session.
      await redisPublisher.publish(
        `requests:${sessionId}`,
        JSON.stringify(serializedRequest)
      );
      logger.log(`Published requests:${sessionId}`, serializedRequest);

      const timeout = setTimeout(async () => {
        await redis.unsubscribe(`responses:${sessionId}:${requestId}`);
        res.statusCode = 408;
        res.end('Request timed out');
      }, 10 * 1000);

      res.on('close', async () => {
        clearTimeout(timeout);
        await redis.unsubscribe(`responses:${sessionId}:${requestId}`);
      });
    } else {
      res.statusCode = 404;
      res.end('Not found');
    }
  };
}

// Define the options interface
interface FakeIncomingMessageOptions {
  method?: string;
  url?: string;
  headers?: IncomingHttpHeaders;
  body?: BodyType;
  socket?: Socket;
}

// Create a fake IncomingMessage
function createFakeIncomingMessage(
  options: FakeIncomingMessageOptions = {}
): IncomingMessage {
  const {
    method = 'GET',
    url = '/',
    headers = {},
    body = null,
    socket = new Socket(),
  } = options;

  // Create a readable stream that will be used as the base for IncomingMessage
  const readable = new Readable();
  readable._read = (): void => {}; // Required implementation

  // Add the body content if provided
  if (body) {
    if (typeof body === 'string') {
      readable.push(body);
    } else if (Buffer.isBuffer(body)) {
      readable.push(body);
    } else {
      // Ensure proper JSON-RPC format
      const bodyString = JSON.stringify(body);
      readable.push(bodyString);
    }
    readable.push(null); // Signal the end of the stream
  } else {
    readable.push(null); // Always end the stream even if no body
  }

  // Create the IncomingMessage instance
  const req = new IncomingMessage(socket);

  // Set the properties
  req.method = method;
  req.url = url;
  req.headers = headers;

  // Copy over the stream methods
  req.push = readable.push.bind(readable);
  req.read = readable.read.bind(readable);
  // @ts-expect-error
  req.on = readable.on.bind(readable);
  req.pipe = readable.pipe.bind(readable);

  return req;
}
