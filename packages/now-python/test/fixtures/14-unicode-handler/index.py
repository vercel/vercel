from http.server import BaseHTTPRequestHandler
import json

class handler(BaseHTTPRequestHandler):

    def do_POST(self):
        print('handling POST request')
        post_body = json.loads(self.rfile.read(int(self.headers['content-length'])).decode('utf-8'))
        name = post_body.get('name', 'someone')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        response_data = {'greeting': f'hello, {name}'}
        self.wfile.write(json.dumps(response_data).encode('utf-8'))
        print('done handling POST request')
        return

    def do_GET(self):
        print('handling GET request')
        self.send_response(200)
        self.end_headers()
        self.wfile.write('ok'.encode('utf-8'))
        print('done handling GET request')
        return
