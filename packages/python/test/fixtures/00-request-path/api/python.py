from http.server import BaseHTTPRequestHandler, HTTPServer

class handler(BaseHTTPRequestHandler):

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type','text/plain')
        self.end_headers()
        self.wfile.write(self.path.encode())
        return

if __name__ == '__main__':
    server_address = ('', 8001)
    httpd = HTTPServer(server_address, handler)
    httpd.serve_forever()
