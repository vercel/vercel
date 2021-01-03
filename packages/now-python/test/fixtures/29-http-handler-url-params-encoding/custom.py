from http.server import BaseHTTPRequestHandler
from urllib.parse import unquote

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(("path=%s" % unquote(self.path)).encode())
        return
