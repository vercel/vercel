from http.server import BaseHTTPRequestHandler


class Handler(BaseHTTPRequestHandler):

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        self.wfile.write('hello:RANDOMNESS_PLACEHOLDER'.encode())
        return
