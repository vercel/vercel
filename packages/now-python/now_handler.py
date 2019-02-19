from http.server import HTTPServer
import json
import requests
from __NOW_HANDLER_FILENAME import handler
import _thread

server = HTTPServer(('', 3000), handler)

def now_handler(event, context):
    _thread.start_new_thread(server.handle_request, ())
    payload = json.loads(event['body'])
    path = payload['path']
    headers = payload['headers']
    method = payload['method']
    encoding = payload.get('encoding')
    body = payload.get('body')

    if (
        (body is not None and len(body) > 0) and
        (encoding is not None and encoding == 'base64')
    ):
        body = base64.b64decode(body)

    res = requests.request(method, 'http://0.0.0.0:3000' + path,
            headers=headers, data=body, allow_redirects=False)

    return {
        'statusCode': res.status_code,
        'headers': dict(res.headers),
        'body': res.text
    }
