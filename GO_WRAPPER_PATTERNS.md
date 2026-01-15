# Go Wrapper Mode Implementation Patterns

This document summarizes the patterns used by other Vercel builders (Node.js, Python, Ruby) for implementing Lambda function wrappers, to guide the implementation of Go wrapper mode.

## Overview

All runtime builders follow a similar pattern:

1. **Build Phase**: Generate a wrapper/launcher script that imports user code
2. **Runtime Phase**: The wrapper handles HTTP requests, invokes user code, and returns responses

## Core Response Format

All runtimes return a consistent `VercelProxyResponse` structure:

```typescript
interface VercelProxyResponse {
  status: number;
  headers: Headers;
  body: Readable | Buffer | null;
  encoding: BufferEncoding;
}
```

## 1. Node.js Implementation

### Files

- `/Users/gscho/src/vercel/vercel/packages/node/src/serverless-functions/serverless-handler.mts`
- `/Users/gscho/src/vercel/vercel/packages/node/src/serverless-functions/helpers.ts`
- `/Users/gscho/src/vercel/vercel/packages/node/src/serverless-functions/helpers-web.ts`

### Key Patterns

#### Handler Discovery

```typescript
// Detects multiple handler types:
// 1. Traditional functions: (req, res) => void
// 2. HTTP method exports: export function GET/POST/etc
// 3. fetch() handlers: export function fetch(request)
// 4. Express/framework servers: server.listen()
```

#### Request Handling

```typescript
async function createServerlessEventHandler(
  entrypointPath: string,
  options: ServerlessServerOptions
): Promise<{
  handler: (request: IncomingMessage) => Promise<VercelProxyResponse>;
  onExit: () => Promise<void>;
}>;
```

#### Helper Functions (VercelRequest/VercelResponse)

```typescript
// Augments standard req/res with helper methods
export async function addHelpers(_req: IncomingMessage, _res: ServerResponse) {
  const req = _req as VercelRequest;
  const res = _res as VercelResponse;

  // Lazy parsing of cookies, query, body
  setLazyProp(req, 'cookies', getCookieParser(req));
  setLazyProp(req, 'query', getQueryParser(req));
  setLazyProp(req, 'body', getBodyParser(body, contentType));

  // Helper methods
  res.status = statusCode => {
    res.statusCode = statusCode;
    return res;
  };
  res.send = body => {
    /* handles JSON, Buffer, string */
  };
  res.json = jsonBody => {
    /* sets content-type and sends */
  };
  res.redirect = (statusOrUrl, url?) => {
    /* sets Location header */
  };
}
```

#### Internal Server Pattern

```typescript
// Creates local HTTP server to proxy requests
const server = createServer(userCode);
const url = await listen(server, { host: '127.0.0.1', port: 0 });

// Forwards incoming Lambda request to local server
const response = await undiciRequest(url, {
  body: await serializeBody(request),
  headers: { ...request.headers },
  method: request.method,
});

return {
  status: response.statusCode,
  headers: toHeaders(response.headers),
  body: isStreaming
    ? response.body
    : Buffer.from(await response.body.arrayBuffer()),
  encoding: 'utf8',
};
```

## 2. Python Implementation

### Files

- `/Users/gscho/src/vercel/vercel/packages/python/vc_init.py`
- `/Users/gscho/src/vercel/vercel/packages/python/src/index.ts` (builder)

### Key Patterns

#### Handler Discovery

```python
# Supports three handler types:
if 'handler' in __vc_variables or 'Handler' in __vc_variables:
    # 1. BaseHTTPRequestHandler subclass
elif 'app' in __vc_variables:
    if not inspect.iscoroutinefunction(__vc_module.app):
        # 2. WSGI app (Flask)
    else:
        # 3. ASGI app (FastAPI)
```

#### WSGI Handler (Flask)

```python
def handle_request(self):
    # Build WSGI environment
    env = {
        'CONTENT_LENGTH': str(content_length),
        'CONTENT_TYPE': self.headers.get('content-type', ''),
        'PATH_INFO': path,
        'QUERY_STRING': query,
        'REQUEST_METHOD': self.command,
        'wsgi.input': BytesIO(body),
        # ... more WSGI variables
    }

    def start_response(status, headers, exc_info=None):
        self.send_response(int(status.split(' ')[0]))
        for name, value in headers:
            self.send_header(name, value)
        self.end_headers()
        return self.wfile.write

    # Call WSGI app
    response = app(env, start_response)
    for data in response:
        if data:
            self.wfile.write(data)
```

#### ASGI Handler (FastAPI)

```python
# Uses Uvicorn server
import uvicorn

# Wrap user app with middleware for IPC
asgi_app = ASGIMiddleware(user_app)

# Bind to ephemeral port
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.bind(('127.0.0.1', 0))
http_port = sock.getsockname()[1]

config = uvicorn.Config(
    app=asgi_app,
    fd=sock.fileno(),
    lifespan='auto',
)
server = uvicorn.Server(config)

# Announce port via IPC
send_message({
    "type": "server-started",
    "payload": {"httpPort": http_port}
})

server.run()  # Blocking
```

#### IPC Protocol

```python
# Python uses Unix socket IPC for logging/metrics
if 'VERCEL_IPC_PATH' in os.environ:
    ipc_sock.connect(os.getenv("VERCEL_IPC_PATH"))

    def send_message(message: dict):
        ipc_sock.sendall((json.dumps(message) + '\0').encode())

# Messages sent:
# - "handler-started": When request begins
# - "end": When request completes
# - "log": For stdout/stderr/logging output
# - "metric": For fetch() metrics
# - "server-started": Announces HTTP port for ASGI
```

#### Request Context Tracking

```python
# Uses contextvars for per-request context
storage: contextvars.ContextVar[dict | None] = contextvars.ContextVar('storage')

# Extract from headers
invocation_id = headers.get('x-vercel-internal-invocation-id')
request_id = headers.get('x-vercel-internal-request-id')

# Set context for logging
token = storage.set({
    "invocationId": invocation_id,
    "requestId": request_id,
})

try:
    await app(scope, receive, send)
finally:
    storage.reset(token)
    send_message({"type": "end", "payload": {"context": {...}}})
```

## 3. Ruby Implementation

### Files

- `/Users/gscho/src/vercel/vercel/packages/ruby/vc_init.rb`
- `/Users/gscho/src/vercel/vercel/packages/ruby/src/index.ts` (builder)

### Key Patterns

#### Handler Discovery

```ruby
def vc__handler(event:, context:)
  payload = JSON.parse(event['body'])

  if $entrypoint.end_with? '.ru'
    return rack_handler(httpMethod, path, body, headers)
  end

  return webrick_handler(httpMethod, path, body, headers)
end
```

#### Rack Handler

```ruby
def rack_handler(httpMethod, path, body, headers)
  require 'rack'

  app, _ = Rack::Builder.parse_file($entrypoint)
  server = Rack::MockRequest.new app

  # Build Rack env
  env = headers.transform_keys { |k| k.split('-').join('_').prepend('HTTP_').upcase }
  res = server.request(httpMethod, path, env.merge({ :input => body }))

  {
    :statusCode => res.status,
    :headers => res.original_headers,
    :body => res.body,
  }
end
```

#### WEBrick Handler

```ruby
def webrick_handler(httpMethod, path, body, headers)
  require_relative $entrypoint

  server = WEBrick::HTTPServer.new :BindAddress => host, :Port => port

  if Handler.is_a?(Proc)
    server.mount_proc '/', Handler
  else
    server.mount '/', Handler
  end

  # Start server in thread
  th = Thread.new(server) { |server| server.start }

  # Make request to local server
  http = Net::HTTP.new(host, port)
  res = http.send_request(httpMethod, path, body, headers)

  # Clean up
  server.shutdown
  Thread.kill(th)

  {
    :statusCode => res.code.to_i,
    :headers => res_headers,
    :body => res.body,
  }
end
```

## 4. Common Build Patterns

### Template Substitution

All runtimes use template substitution to inject configuration:

**Python:**

```typescript
const handlerPyContents = originalHandlerPyContents
  .replace(/__VC_HANDLER_MODULE_NAME/g, moduleName)
  .replace(/__VC_HANDLER_ENTRYPOINT/g, entrypointWithSuffix)
  .replace(/__VC_HANDLER_VENDOR_DIR/g, vendorDir);

files[`${handlerPyFilename}.py`] = new FileBlob({ data: handlerPyContents });

const output = new Lambda({
  files,
  handler: `${handlerPyFilename}.vc_handler`,
  runtime: pythonVersion.runtime,
});
```

**Ruby:**

```typescript
const nowHandlerRbContents = originalHandlerRbContents.replace(
  /__VC_HANDLER_FILENAME/g,
  userHandlerFilePath
);

outputFiles[`${handlerRbFilename}.rb`] = new FileBlob({
  data: nowHandlerRbContents,
});

const output = new Lambda({
  files: outputFiles,
  handler: `${handlerRbFilename}.vc__handler`,
  runtime,
});
```

### File Exclusion

```typescript
const predefinedExcludes = [
  '.git/**',
  '.gitignore',
  '.vercel/**',
  '.pnpm-store/**',
  '**/node_modules/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.venv/**',
  '**/venv/**',
  '**/__pycache__/**',
];

const files = await glob('**', {
  cwd: workPath,
  ignore: predefinedExcludes,
});
```

## 5. Go-Specific Considerations

Based on current Go implementation in `/Users/gscho/src/vercel/vercel/packages/go/`:

### Current Handler Pattern

```go
// User writes standard http.Handler functions
func Handler(w http.ResponseWriter, r *http.Request) {
    fmt.Fprintf(w, "Hello World")
}
```

### AST Analysis

```typescript
// Go uses AST parsing to find handler functions
const analyzed = await getAnalyzedEntrypoint({
  entrypoint,
  modulePath,
  workPath,
});
// Returns: { functionName: "Handler", packageName: "cowsay", watch?: boolean }
```

### Proposed Go Wrapper Pattern

#### Option 1: HTTP Server Wrapper (Similar to Python/Ruby)

```go
// Generated wrapper: vc__handler__go.go
package main

import (
    "net/http"
    usercode "path/to/user/package"
)

func main() {
    http.HandleFunc("/", usercode.Handler)
    http.ListenAndServe(":"+os.Getenv("PORT"), nil)
}
```

Then TypeScript launcher:

```typescript
// Start Go server on ephemeral port
const server = spawn('go', ['run', 'vc__handler__go.go']);
const port = await detectPort(server);

// Proxy Lambda requests to Go server
const response = await fetch(`http://localhost:${port}${request.path}`, {
  method: request.method,
  headers: request.headers,
  body: request.body,
});

return {
  status: response.status,
  headers: response.headers,
  body: await response.arrayBuffer(),
  encoding: 'utf8',
};
```

#### Option 2: CGI-Style Wrapper

```go
// Generated wrapper calls user handler directly
package main

import (
    "encoding/json"
    "net/http"
    "net/http/httptest"
    usercode "path/to/user/package"
)

type LambdaEvent struct {
    Path    string              `json:"path"`
    Method  string              `json:"method"`
    Headers map[string]string   `json:"headers"`
    Body    string              `json:"body"`
}

func handler(event LambdaEvent) (map[string]interface{}, error) {
    req := httptest.NewRequest(event.Method, event.Path, strings.NewReader(event.Body))
    for k, v := range event.Headers {
        req.Header.Set(k, v)
    }

    w := httptest.NewRecorder()
    usercode.Handler(w, req)

    return map[string]interface{}{
        "statusCode": w.Code,
        "headers":    w.Header(),
        "body":       w.Body.String(),
    }, nil
}
```

## 6. Key Takeaways for Go Implementation

### Must Have

1. **HTTP Server**: Start local server, proxy requests (like Python ASGI/Ruby WEBrick)
2. **Template Substitution**: Generate wrapper that imports user code
3. **IPC Support**: Implement `server-started` message with HTTP port
4. **Response Format**: Return `{status, headers, body, encoding}`
5. **Context Extraction**: Handle `x-vercel-internal-*` headers
6. **File Exclusion**: Exclude common directories from bundle

### Should Have

1. **Request Context**: Track invocationId/requestId for logging
2. **Logging IPC**: Send logs via Unix socket if available
3. **Graceful Shutdown**: Handle cleanup on process exit
4. **Error Handling**: Proper error messages for missing handlers

### Nice to Have

1. **Streaming Support**: Support response streaming (Node.js has this)
2. **Helper Methods**: Convenience methods on request/response (like Node.js)
3. **Framework Detection**: Auto-detect common Go frameworks (Gin, Echo, Chi)

## 7. Implementation Checklist

- [ ] Create Go wrapper template (similar to `vc_init.py`/`vc_init.rb`)
- [ ] Implement HTTP server startup in wrapper
- [ ] Implement IPC protocol for `server-started` message
- [ ] Update `index.ts` build phase to generate wrapper
- [ ] Handle request proxying from Lambda to Go server
- [ ] Implement response format conversion
- [ ] Add support for context headers extraction
- [ ] Add logging/metrics IPC (optional)
- [ ] Test with various Go frameworks (net/http, Gin, Echo)
- [ ] Update documentation

## 8. References

### File Paths

- Node.js: `/Users/gscho/src/vercel/vercel/packages/node/src/serverless-functions/`
- Python: `/Users/gscho/src/vercel/vercel/packages/python/vc_init.py`
- Ruby: `/Users/gscho/src/vercel/vercel/packages/ruby/vc_init.rb`
- Go: `/Users/gscho/src/vercel/vercel/packages/go/src/`

### Key Types

```typescript
// From @vercel/build-utils
interface Lambda {
  files: Files;
  handler: string;
  runtime: string;
  environment?: Record<string, string>;
  supportsResponseStreaming?: boolean;
}

// From packages/node/src/types.d.ts
interface VercelProxyResponse {
  status: number;
  headers: Headers;
  body: Readable | Buffer | null;
  encoding: BufferEncoding;
}
```
