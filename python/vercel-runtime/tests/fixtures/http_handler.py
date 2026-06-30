"""A basic BaseHTTPRequestHandler for testing."""

import json
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/oidc":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            token = self.headers.get("x-vercel-oidc-token", "")
            self.wfile.write(token.encode())
            return

        if self.path == "/headers":
            payload = {k.lower(): v for k, v in self.headers.items()}
            body = json.dumps(payload).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(f"GET {self.path}".encode())

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(f"POST {self.path} body={body}".encode())
