from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('content-type', 'text/plain')
        self.send_header('set-cookie', 'one=first; Secure; HttpOnly; SameSite=Strict')
        self.send_header('set-cookie', 'two=second; Secure; HttpOnly; SameSite=Strict')
        self.end_headers()
        self.wfile.write('handler:RANDOMNESS_PLACEHOLDER'.encode())
        return
