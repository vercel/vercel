import { startDevServer } from '../src/start-dev-server';
import path from 'path';
import fs from 'fs-extra';
import execa from 'execa';

jest.setTimeout(120 * 1000);

const fixturesPath = path.resolve(__dirname, 'fixtures');
const fixturePath = path.join(fixturesPath, '42-fastapi-middleware');

async function withDevServer(
  workPath: string,
  fn: (url: string) => Promise<void>
) {
  const entrypoint = 'app.py';
  const config = { framework: 'fastapi' as const };

  // Create virtual environment and install dependencies if requirements.txt exists
  const requirementsPath = path.join(workPath, 'requirements.txt');
  if (await fs.pathExists(requirementsPath)) {
    try {
      // Create virtual environment
      await execa('python3', ['-m', 'venv', '.venv'], {
        cwd: workPath,
        stdio: 'inherit',
      });

      // Install dependencies in venv
      const venvPython =
        process.platform === 'win32'
          ? path.join(workPath, '.venv', 'Scripts', 'python.exe')
          : path.join(workPath, '.venv', 'bin', 'python');

      await execa(
        venvPython,
        ['-m', 'pip', 'install', '-r', 'requirements.txt'],
        {
          cwd: workPath,
          stdio: 'inherit',
        }
      );
    } catch (err) {
      console.warn('Failed to create venv or install dependencies:', err);
      // Continue anyway - maybe dependencies are already installed
    }
  }

  const result = await startDevServer({
    entrypoint,
    workPath,
    config,
    meta: { isDev: true },
    files: {},
    repoRootPath: workPath,
  });

  if (!result) {
    throw new Error('Failed to start dev server');
  }

  const { port, shutdown } = result;
  const url = `http://127.0.0.1:${port}`;

  // Wait a bit for server to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    await fn(url);
  } finally {
    if (shutdown) {
      await shutdown();
    }
  }
}

describe('FastAPI Middleware', () => {
  describe('RequestTrackingMiddleware', () => {
    it('should add custom headers to responses', async () => {
      await withDevServer(fixturePath, async url => {
        const response = await fetch(`${url}/`);
        expect(response.status).toBe(200);

        // Verify middleware headers are present
        expect(response.headers.get('X-Middleware-Processed')).toBe('true');
        expect(response.headers.get('X-Request-ID')).toMatch(/^req-\d+$/);
        expect(response.headers.get('X-Process-Time')).toBeTruthy();
        // Request count should be a positive number
        const count = parseInt(
          response.headers.get('X-Request-Count') || '0',
          10
        );
        expect(count).toBeGreaterThan(0);
      });
    });

    it('should track request count across multiple requests', async () => {
      await withDevServer(fixturePath, async url => {
        const response1 = await fetch(`${url}/`);
        const count1 = parseInt(
          response1.headers.get('X-Request-Count') || '0',
          10
        );

        const response2 = await fetch(`${url}/api/test`);
        const count2 = parseInt(
          response2.headers.get('X-Request-Count') || '0',
          10
        );

        const response3 = await fetch(`${url}/api/users`);
        const count3 = parseInt(
          response3.headers.get('X-Request-Count') || '0',
          10
        );

        // Verify counts are incrementing
        expect(count2).toBe(count1 + 1);
        expect(count3).toBe(count2 + 1);
        expect(count3).toBe(count1 + 2);
      });
    });

    it('should add request state to request object', async () => {
      await withDevServer(fixturePath, async url => {
        const response = await fetch(`${url}/api/test`);
        expect(response.status).toBe(200);
        const body = await response.json();

        // Verify middleware state is accessible in route handler
        expect(body.request_id).toMatch(/^req-\d+$/);
        expect(body.middleware_processed).toBe(true);
      });
    });
  });

  describe('AuthMiddleware', () => {
    it('should allow access to unprotected routes', async () => {
      await withDevServer(fixturePath, async url => {
        const response = await fetch(`${url}/api/users`);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({ users: ['alice', 'bob'] });
      });
    });

    it('should block access to protected routes without API key', async () => {
      await withDevServer(fixturePath, async url => {
        const response = await fetch(`${url}/api/protected`);
        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body).toEqual({ error: 'Unauthorized' });
      });
    });

    it('should allow access to protected routes with correct API key', async () => {
      await withDevServer(fixturePath, async url => {
        const response = await fetch(`${url}/api/protected`, {
          headers: { 'X-API-Key': 'test-api-key-123' },
        });
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({ message: 'This is a protected endpoint' });
      });
    });

    it('should block access to protected routes with incorrect API key', async () => {
      await withDevServer(fixturePath, async url => {
        const response = await fetch(`${url}/api/protected`, {
          headers: { 'X-API-Key': 'wrong-key' },
        });
        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body).toEqual({ error: 'Unauthorized' });
      });
    });
  });

  describe('middleware execution order', () => {
    it('should execute middlewares in order and apply all headers', async () => {
      await withDevServer(fixturePath, async url => {
        const response = await fetch(`${url}/api/protected`, {
          headers: { 'X-API-Key': 'test-api-key-123' },
        });
        expect(response.status).toBe(200);

        // Both middlewares should have processed the request
        expect(response.headers.get('X-Middleware-Processed')).toBe('true');
        expect(response.headers.get('X-Request-ID')).toMatch(/^req-\d+$/);
      });
    });
  });

  describe('static file serving', () => {
    it('should serve static files from public/ directory', async () => {
      await withDevServer(fixturePath, async url => {
        // Test static file is served by middleware
        const staticResponse = await fetch(`${url}/test.txt`);
        expect(staticResponse.status).toBe(200);
        const staticBody = await staticResponse.text();
        expect(staticBody.trim()).toBe('This is a static file');

        // Test FastAPI app is still accessible
        const apiResponse = await fetch(`${url}/`);
        expect(apiResponse.status).toBe(200);
        const apiBody = await apiResponse.json();
        expect(apiBody).toEqual({ message: 'Hello from FastAPI' });
      });
    });

    it('should delegate to FastAPI app when static file does not exist', async () => {
      await withDevServer(fixturePath, async url => {
        // Test non-existent static file delegates to FastAPI
        const response = await fetch(`${url}/nonexistent.txt`);
        expect(response.status).toBe(404);

        // Test FastAPI app is accessible
        const apiResponse = await fetch(`${url}/`);
        expect(apiResponse.status).toBe(200);
        const apiBody = await apiResponse.json();
        expect(apiBody).toEqual({ message: 'Hello from FastAPI' });
      });
    });

    it('should protect against path traversal attacks', async () => {
      await withDevServer(fixturePath, async url => {
        // Test path traversal attempt - should not serve files outside public directory
        const traversalResponse = await fetch(`${url}/../app.py`);
        // Should not serve the file outside public directory
        // Either 404 or delegate to FastAPI (which will return 404)
        expect(traversalResponse.status).toBeGreaterThanOrEqual(404);

        // Test legitimate static file access
        const safeResponse = await fetch(`${url}/safe.txt`);
        expect(safeResponse.status).toBe(200);
        const safeBody = await safeResponse.text();
        expect(safeBody.trim()).toBe('Safe content');
      });
    });

    it('should serve static files with correct content type', async () => {
      await withDevServer(fixturePath, async url => {
        // Test SVG file is served by middleware
        const svgResponse = await fetch(`${url}/logo.svg`);
        expect(svgResponse.status).toBe(200);
        const svgBody = await svgResponse.text();
        expect(svgBody).toContain('<svg');
        // Content type should be set by StaticFiles middleware
        const contentType = svgResponse.headers.get('content-type');
        expect(contentType).toBeTruthy();
      });
    });
  });

  describe('FastAPI app delegation', () => {
    it('should delegate API routes to FastAPI app', async () => {
      await withDevServer(fixturePath, async url => {
        // Test root route
        const rootResponse = await fetch(`${url}/`);
        expect(rootResponse.status).toBe(200);
        const rootBody = await rootResponse.json();
        expect(rootBody).toEqual({ message: 'Hello from FastAPI' });

        // Test API route (includes middleware state)
        const apiResponse = await fetch(`${url}/api/test`);
        expect(apiResponse.status).toBe(200);
        const apiBody = await apiResponse.json();
        expect(apiBody.message).toBe('API endpoint');
        expect(apiBody.request_id).toMatch(/^req-\d+$/);
        expect(apiBody.middleware_processed).toBe(true);

        // Test users route
        const usersResponse = await fetch(`${url}/api/users`);
        expect(usersResponse.status).toBe(200);
        const usersBody = await usersResponse.json();
        expect(usersBody).toEqual({ users: ['alice', 'bob'] });

        // Test parameterized route
        const userResponse = await fetch(`${url}/api/users/123`);
        expect(userResponse.status).toBe(200);
        const userBody = await userResponse.json();
        expect(userBody).toEqual({ user_id: '123' });
      });
    });

    it('should handle POST requests to FastAPI app', async () => {
      await withDevServer(fixturePath, async url => {
        // Test POST request - middleware should delegate to FastAPI
        const postResponse = await fetch(`${url}/api/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'test', value: 42 }),
        });
        expect(postResponse.status).toBe(200);
        const postBody = await postResponse.json();
        expect(postBody).toEqual({ created: 'test', value: 42 });
      });
    });
  });

  describe('edge cases', () => {
    it('should work when public directory exists', async () => {
      await withDevServer(fixturePath, async url => {
        // Test FastAPI app is accessible even when public directory exists
        const apiResponse = await fetch(`${url}/`);
        expect(apiResponse.status).toBe(200);
        const apiBody = await apiResponse.json();
        expect(apiBody).toEqual({ message: 'Hello from FastAPI' });
      });
    });

    it('should prioritize static files over FastAPI routes', async () => {
      await withDevServer(fixturePath, async url => {
        // Static file should be served by middleware, not FastAPI route
        // This proves the middleware is intercepting and serving static files first
        const response = await fetch(`${url}/test.txt`);
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body.trim()).toBe('This is a static file');
        // Verify it's not a JSON response from FastAPI
        expect(body).not.toContain('message');
        expect(body).not.toContain('Hello from FastAPI');
      });
    });

    it('should verify middleware shim is created and used', async () => {
      await withDevServer(fixturePath, async url => {
        // Verify the middleware shim file was created
        const shimPath = path.join(
          fixturePath,
          '.vercel',
          'python',
          'vc_init_dev_asgi.py'
        );
        const shimExists = await fs.pathExists(shimPath);
        expect(shimExists).toBe(true);

        // Verify static file is served by middleware (not FastAPI)
        const staticResponse = await fetch(`${url}/test.txt`);
        expect(staticResponse.status).toBe(200);
        const staticBody = await staticResponse.text();
        expect(staticBody.trim()).toBe('This is a static file');

        // Verify FastAPI app still works for non-static routes
        const apiResponse = await fetch(`${url}/`);
        expect(apiResponse.status).toBe(200);
        const apiBody = await apiResponse.json();
        expect(apiBody).toEqual({ message: 'Hello from FastAPI' });
      });
    });
  });
});
