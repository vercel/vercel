from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Parse the URL path to extract the dynamic parameter
        url_parts = urlparse(self.path)
        path_parts = url_parts.path.split('/')
        
        # Get the dynamic ID from the path
        dynamic_id = path_parts[-1] if len(path_parts) > 1 else 'unknown'
        
        # Parse query parameters
        query_params = parse_qs(url_parts.query)
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        
        response = {
            'id': dynamic_id,
            'query': query_params,
            'message': f'Dynamic route handler for ID: {dynamic_id}'
        }
        
        import json
        self.wfile.write(json.dumps(response).encode())