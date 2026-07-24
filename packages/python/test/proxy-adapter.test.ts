import fs from 'fs';
import os from 'os';
import path from 'path';
import execa from 'execa';
import { afterEach, describe, expect, it } from 'vitest';
import { getProxyAdapterSource } from '../src/proxy';

const temporaryDirectories: string[] = [];
const pythonBin = process.env.PYTHON_BIN || 'python3';

function makeTemporaryDirectory(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'vc-python-proxy-adapter-')
  );
  temporaryDirectories.push(directory);
  return directory;
}

async function invokeProxy(
  proxySource: string,
  additionalFiles: Record<string, string> = {}
): Promise<Record<string, unknown>[]> {
  const directory = makeTemporaryDirectory();
  fs.writeFileSync(path.join(directory, 'proxy.py'), proxySource);
  fs.writeFileSync(
    path.join(directory, 'vc__proxy__python.py'),
    getProxyAdapterSource()
  );
  for (const [name, contents] of Object.entries(additionalFiles)) {
    const filePath = path.join(directory, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
  }

  const runner = `
import asyncio
import json

from vc__proxy__python import app

messages = []

async def receive():
    return {"type": "http.request", "body": b"", "more_body": False}

async def send(message):
    normalized = dict(message)
    if "headers" in normalized:
        normalized["headers"] = [
            [name.decode(), value.decode()]
            for name, value in normalized["headers"]
        ]
    if "body" in normalized:
        normalized["body"] = normalized["body"].decode()
    messages.append(normalized)

asyncio.run(
    app(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "https",
            "path": "/asset",
            "raw_path": b"/asset",
            "query_string": b"",
            "root_path": "",
            "headers": [],
            "server": ("example.com", 443),
            "client": ("127.0.0.1", 1234),
        },
        receive,
        send,
    )
)

print(json.dumps(messages))
`;

  const { stdout } = await execa(pythonBin, ['-c', runner], {
    cwd: directory,
    env: {
      __VC_PROXY_MODULE_NAME: 'proxy',
    },
  });

  return JSON.parse(stdout);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('Python proxy adapter', () => {
  it('invokes a vercel.proxy application with the ASGI signature', async () => {
    const messages = await invokeProxy(`
class Proxy:
    __vercel_proxy__ = True

    async def __call__(self, scope, receive, send):
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [(b"x-proxy-shape", b"asgi")],
            }
        )
        await send({"type": "http.response.body", "body": b""})

proxy = Proxy()
`);

    expect(messages).toEqual([
      {
        type: 'http.response.start',
        status: 200,
        headers: [['x-proxy-shape', 'asgi']],
      },
      {
        type: 'http.response.body',
        body: '',
      },
    ]);
  });

  it('runs only the user middleware from a FastAPI or Starlette app', async () => {
    const messages = await invokeProxy(
      `
from starlette.applications import Starlette

class Middleware:
    def __init__(self, cls, *args, **kwargs):
        self.cls = cls
        self.args = args
        self.kwargs = kwargs

class HeaderMiddleware:
    def __init__(self, app, name, value):
        self.app = app
        self.name = name
        self.value = value

    async def __call__(self, scope, receive, send):
        assert scope["app"] is proxy

        async def send_with_header(message):
            if message["type"] == "http.response.start":
                message = dict(message)
                message["headers"] = [
                    *message.get("headers", []),
                    (self.name, self.value),
                ]
            await send(message)

        await self.app(scope, receive, send_with_header)

proxy = Starlette()
proxy.user_middleware = [
    Middleware(HeaderMiddleware, b"x-first", b"one"),
    Middleware(HeaderMiddleware, b"x-second", b"two"),
]
`,
      {
        'starlette/__init__.py': '',
        'starlette/applications.py': `
class Starlette:
    def __init__(self):
        self.user_middleware = []

    async def __call__(self, scope, receive, send):
        await send(
            {
                "type": "http.response.start",
                "status": 418,
                "headers": [(b"x-framework-router", b"called")],
            }
        )
        await send({"type": "http.response.body", "body": b""})
`,
      }
    );

    expect(messages).toEqual([
      {
        type: 'http.response.start',
        status: 200,
        headers: [
          ['x-middleware-next', '1'],
          ['x-second', 'two'],
          ['x-first', 'one'],
        ],
      },
      {
        type: 'http.response.body',
        body: '',
      },
    ]);
  });

  it('continues to invoke function proxies with a Request', async () => {
    const messages = await invokeProxy(
      `
async def proxy(request):
    assert request.scope["path"] == "/asset"
    return None
`,
      {
        'starlette/__init__.py': '',
        'starlette/requests.py': `
class Request:
    def __init__(self, scope, receive=None):
        self.scope = scope
`,
      }
    );

    expect(messages).toEqual([
      {
        type: 'http.response.start',
        status: 200,
        headers: [['x-middleware-next', '1']],
      },
      {
        type: 'http.response.body',
        body: '',
      },
    ]);
  });
});
