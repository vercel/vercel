from http.server import BaseHTTPRequestHandler
from cowpy import cow


class handler(BaseHTTPRequestHandler):

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        message = cow.Cowacter().milk('pip:RANDOMNESS_PLACEHOLDER')
        self.wfile.write(message.encode())
        return
