import { describe, it, expect } from 'vitest';
import { findAppOrHandler } from '../src';

describe('findAppOrHandler', () => {
  describe('app detection', () => {
    it('detects Flask app assignment', async () => {
      const source = `
from flask import Flask
app = Flask(__name__)
`;
      expect(await findAppOrHandler(source)).toBe('app');
    });

    it('detects FastAPI app assignment', async () => {
      const source = `
from fastapi import FastAPI
app = FastAPI()
`;
      expect(await findAppOrHandler(source)).toBe('app');
    });

    it('detects Sanic app with type annotation', async () => {
      const source = `
from sanic import Sanic
app: Sanic = Sanic()
`;
      expect(await findAppOrHandler(source)).toBe('app');
    });

    it('detects app created via factory function', async () => {
      const source = `
app = create_app()
`;
      expect(await findAppOrHandler(source)).toBe('app');
    });

    it('detects WSGI function named app', async () => {
      const source = `
def app(environ, start_response):
    pass
`;
      expect(await findAppOrHandler(source)).toBe('app');
    });

    it('detects ASGI async function named app', async () => {
      const source = `
async def app(scope, receive, send):
    pass
`;
      expect(await findAppOrHandler(source)).toBe('app');
    });

    it('detects Django WSGI application', async () => {
      const source = `
from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()
`;
      expect(await findAppOrHandler(source)).toBe('application');
    });

    it('detects Django ASGI application', async () => {
      const source = `
from django.core.asgi import get_asgi_application
application = get_asgi_application()
`;
      expect(await findAppOrHandler(source)).toBe('application');
    });

    it('detects imported app', async () => {
      const source = `
from server import app
`;
      expect(await findAppOrHandler(source)).toBe('app');
    });

    it('detects aliased import as app', async () => {
      const source = `
from server import application as app
`;
      expect(await findAppOrHandler(source)).toBe('app');
    });

    it('detects imported application', async () => {
      const source = `
from server import application as app
`;
      expect(await findAppOrHandler(source)).toBe('app');
    });

    it('detects aliased import as application', async () => {
      const source = `
from server import callable as application
`;
      expect(await findAppOrHandler(source)).toBe('application');
    });

    it('does not detect nested app assignment', async () => {
      const source = `
def create():
    app = Flask(__name__)
    return app
`;
      expect(await findAppOrHandler(source)).toBeNull();
    });

    it('does not detect app in class method', async () => {
      const source = `
class Factory:
    def create(self):
        app = FastAPI()
        return app
`;
      expect(await findAppOrHandler(source)).toBeNull();
    });
  });

  describe('handler detection', () => {
    it('detects handler class (lowercase)', async () => {
      const source = `
from http.server import BaseHTTPRequestHandler
class handler(BaseHTTPRequestHandler):
    pass
`;
      expect(await findAppOrHandler(source)).toBe('handler');
    });

    it('detects Handler class (capitalized)', async () => {
      const source = `
from http.server import BaseHTTPRequestHandler
class Handler(BaseHTTPRequestHandler):
    pass
`;
      expect(await findAppOrHandler(source)).toBe('Handler');
    });

    it('detects HANDLER class (uppercase)', async () => {
      const source = `
from http.server import BaseHTTPRequestHandler
class HANDLER(BaseHTTPRequestHandler):
    pass
`;
      expect(await findAppOrHandler(source)).toBe('HANDLER');
    });

    it('does not detect nested handler class', async () => {
      const source = `
def create_handler():
    class handler(BaseHTTPRequestHandler):
        pass
    return handler
`;
      expect(await findAppOrHandler(source)).toBeNull();
    });
  });

  describe('negative cases', () => {
    it('returns null for empty file', async () => {
      expect(await findAppOrHandler('')).toBeNull();
    });

    it('returns null for file without app or handler', async () => {
      const source = `
def main():
    print("Hello, world!")

if __name__ == "__main__":
    main()
`;
      expect(await findAppOrHandler(source)).toBeNull();
    });

    it('returns null for invalid Python syntax', async () => {
      const source = `
def invalid(
`;
      expect(await findAppOrHandler(source)).toBeNull();
    });

    it('does not detect other class names', async () => {
      const source = `
class MyHandler(BaseHTTPRequestHandler):
    pass
`;
      expect(await findAppOrHandler(source)).toBeNull();
    });

    it('does not match app in comments', async () => {
      const source = `
# app = Flask(__name__)
`;
      expect(await findAppOrHandler(source)).toBeNull();
    });

    it('does not match app in strings', async () => {
      const source = `
code = "app = Flask(__name__)"
`;
      expect(await findAppOrHandler(source)).toBeNull();
    });

    it('returns null for file with only comments', async () => {
      const source = `
# just a comment
# another comment
`;
      expect(await findAppOrHandler(source)).toBeNull();
    });

    it('does not detect app as function parameter', async () => {
      const source = `
def process(app):
    return app.run()
`;
      expect(await findAppOrHandler(source)).toBeNull();
    });

    it('does not detect handler function (only class)', async () => {
      const source = `
def handler(request):
    return response
`;
      expect(await findAppOrHandler(source)).toBeNull();
    });

    it('does not detect app in decorator', async () => {
      const source = `
@app.route("/")
def index():
    pass
`;
      expect(await findAppOrHandler(source)).toBeNull();
    });

    it('does not detect app as attribute access', async () => {
      const source = `
result = server.app.run()
`;
      expect(await findAppOrHandler(source)).toBeNull();
    });
  });
});
