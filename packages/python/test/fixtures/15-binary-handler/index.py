from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.end_headers()
        with open("zeit-white-triangle.png", "rb") as image:
            self.wfile.write(image.read())
        return
