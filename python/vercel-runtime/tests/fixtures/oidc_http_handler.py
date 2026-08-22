"""BaseHTTPRequestHandler that returns the OIDC token from the request context.

Regression fixture for the raw-handler path: the runtime must publish the
request's OIDC header into vercel's context (captured into the handler thread)
so handler code can resolve the token the way the SDK does, rather than only
reading the wire header.
"""

from http.server import BaseHTTPRequestHandler

from vercel.oidc import get_vercel_oidc_token


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        token = get_vercel_oidc_token()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(token.encode())
