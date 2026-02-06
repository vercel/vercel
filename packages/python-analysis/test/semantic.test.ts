import { describe, expect, it } from 'vitest';
import { containsAppOrHandler } from '../src';

describe('containsAppOrHandler', () => {
  describe('app detection', () => {
    it('detects Flask app assignment', async () => {
      const source = `
from flask import Flask
app = Flask(__name__)
`;
      expect(await containsAppOrHandler(source)).toBe(true);
    });

    it('detects FastAPI app assignment', async () => {
      const source = `
from fastapi import FastAPI
app = FastAPI()
`;
      expect(await containsAppOrHandler(source)).toBe(true);
    });

    it('detects Sanic app with type annotation', async () => {
      const source = `
from sanic import Sanic
app: Sanic = Sanic()
`;
      expect(await containsAppOrHandler(source)).toBe(true);
    });

    it('detects app created via factory function', async () => {
      const source = `
app = create_app()
`;
      expect(await containsAppOrHandler(source)).toBe(true);
    });

    it('detects WSGI function named app', async () => {
      const source = `
def app(environ, start_response):
    pass
`;
      expect(await containsAppOrHandler(source)).toBe(true);
    });

    it('detects ASGI async function named app', async () => {
      const source = `
async def app(scope, receive, send):
    pass
`;
      expect(await containsAppOrHandler(source)).toBe(true);
    });

    it('detects imported app', async () => {
      const source = `
from server import app
`;
      expect(await containsAppOrHandler(source)).toBe(true);
    });

    it('detects aliased import as app', async () => {
      const source = `
from server import application as app
`;
      expect(await containsAppOrHandler(source)).toBe(true);
    });

    it('does not detect nested app assignment', async () => {
      const source = `
def create():
    app = Flask(__name__)
    return app
`;
      expect(await containsAppOrHandler(source)).toBe(false);
    });

    it('does not detect app in class method', async () => {
      const source = `
class Factory:
    def create(self):
        app = FastAPI()
        return app
`;
      expect(await containsAppOrHandler(source)).toBe(false);
    });
  });

  describe('handler detection', () => {
    it('detects handler class (lowercase)', async () => {
      const source = `
from http.server import BaseHTTPRequestHandler
class handler(BaseHTTPRequestHandler):
    pass
`;
      expect(await containsAppOrHandler(source)).toBe(true);
    });

    it('detects Handler class (capitalized)', async () => {
      const source = `
from http.server import BaseHTTPRequestHandler
class Handler(BaseHTTPRequestHandler):
    pass
`;
      expect(await containsAppOrHandler(source)).toBe(true);
    });

    it('detects HANDLER class (uppercase)', async () => {
      const source = `
from http.server import BaseHTTPRequestHandler
class HANDLER(BaseHTTPRequestHandler):
    pass
`;
      expect(await containsAppOrHandler(source)).toBe(true);
    });

    it('does not detect nested handler class', async () => {
      const source = `
def create_handler():
    class handler(BaseHTTPRequestHandler):
        pass
    return handler
`;
      expect(await containsAppOrHandler(source)).toBe(false);
    });
  });

  describe('negative cases', () => {
    it('returns false for empty file', async () => {
      expect(await containsAppOrHandler('')).toBe(false);
    });

    it('returns false for file without app or handler', async () => {
      const source = `
def main():
    print("Hello, world!")

if __name__ == "__main__":
    main()
`;
      expect(await containsAppOrHandler(source)).toBe(false);
    });

    it('returns false for invalid Python syntax', async () => {
      const source = `
def invalid(
`;
      expect(await containsAppOrHandler(source)).toBe(false);
    });

    it('does not detect application variable (not app)', async () => {
      const source = `
from fastapi import FastAPI
application = FastAPI()
`;
      expect(await containsAppOrHandler(source)).toBe(false);
    });

    it('does not detect other class names', async () => {
      const source = `
class MyHandler(BaseHTTPRequestHandler):
    pass
`;
      expect(await containsAppOrHandler(source)).toBe(false);
    });

    it('does not match app in comments', async () => {
      const source = `
# app = Flask(__name__)
`;
      expect(await containsAppOrHandler(source)).toBe(false);
    });

    it('does not match app in strings', async () => {
      const source = `
code = "app = Flask(__name__)"
`;
      expect(await containsAppOrHandler(source)).toBe(false);
    });

    it('returns false for file with only comments', async () => {
      const source = `
# just a comment
# another comment
`;
      expect(await containsAppOrHandler(source)).toBe(false);
    });

    it('does not detect app as function parameter', async () => {
      const source = `
def process(app):
    return app.run()
`;
      expect(await containsAppOrHandler(source)).toBe(false);
    });

    it('does not detect handler function (only class)', async () => {
      const source = `
def handler(request):
    return response
`;
      expect(await containsAppOrHandler(source)).toBe(false);
    });

    it('does not detect app in decorator', async () => {
      const source = `
@app.route("/")
def index():
    pass
`;
      expect(await containsAppOrHandler(source)).toBe(false);
    });

    it('does not detect app as attribute access', async () => {
      const source = `
result = server.app.run()
`;
      expect(await containsAppOrHandler(source)).toBe(false);
    });
  });
});
