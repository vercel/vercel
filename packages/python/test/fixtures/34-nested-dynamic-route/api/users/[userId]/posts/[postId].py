from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import json


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Parse the URL path to extract dynamic parameters
        url_parts = urlparse(self.path)
        path_parts = [part for part in url_parts.path.split('/') if part]
        
        # Extract userId and postId from the path
        user_id = None
        post_id = None
        
        try:
            # Expected path: /api/users/{userId}/posts/{postId}
            if len(path_parts) >= 4 and path_parts[0] == 'api' and path_parts[1] == 'users' and path_parts[3] == 'posts':
                user_id = path_parts[2]
                post_id = path_parts[4]
        except IndexError:
            pass
        
        # Parse query parameters
        query_params = parse_qs(url_parts.query)
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        
        response = {
            'userId': user_id,
            'postId': post_id,
            'query': query_params,
            'message': f'Nested dynamic route - User: {user_id}, Post: {post_id}'
        }
        
        self.wfile.write(json.dumps(response).encode())