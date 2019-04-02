# This builder is heavily based on the following projects:
#
# - https://github.com/logandk/serverless-wsgi
# - https://github.com/seanbrant/requests-wsgi-adapter
#
# A workaround used by `serverless-wsgi` needed to support multiple headers with
# the same name, especially `Set-Cookie`, has become obsolete because AWS API
# Gateway has received multi-header support on October 5, 2018.
import base64
import json
import sys
try:
    from urllib.parse import urlparse
except ImportError:
    from urlparse import urlparse

from werkzeug._compat import BytesIO
from werkzeug._compat import string_types
from werkzeug._compat import to_bytes
from werkzeug._compat import wsgi_encoding_dance
from werkzeug.datastructures import Headers
from werkzeug.wrappers import Response

from __NOW_HANDLER_FILENAME import app


def now_handler(event, context):
    payload = json.loads(event['body'])
    
    headers = Headers(payload.get('headers', {}))

    body = payload.get('body', '')
    if body != '':
        if payload.get('encoding') == 'base64':
            body = base64.b64decode(body)
    if isinstance(body, string_types):
        body = to_bytes(body, charset='utf-8')
    
    urlinfo = urlparse(payload['path'])
    
    environ = {
        'CONTENT_LENGTH': str(len(body)),
        'CONTENT_TYPE': headers.get('content-type', ''),
        'PATH_INFO': payload['path'],
        'QUERY_STRING': urlinfo.query,
        'REMOTE_ADDR': headers.get(
            'x-forwarded-for', headers.get(
                'x-real-ip', payload.get(
                    'true-client-ip', ''))),
        'REQUEST_METHOD': payload['method'],
        'SERVER_NAME': headers.get('host', 'lambda'),
        'SERVER_PORT': headers.get('x-forwarded-port', '80'),
        'SERVER_PROTOCOL': 'HTTP/1.1',
        'event': event,
        'context': context,
        'wsgi.errors': sys.stderr,
        'wsgi.input': BytesIO(body),
        'wsgi.multiprocess': False,
        'wsgi.multithread': False,
        'wsgi.run_once': False,
        'wsgi.url_scheme': headers.get('x-forwarded-proto', 'http'),
        'wsgi.version': (1, 0),
    }

    for key, value in environ.items():
        if isinstance(value, string_types):
            environ[key] = wsgi_encoding_dance(value)

    for key, value in headers.items():
        key = 'HTTP_' + key.upper().replace('-', '_')
        if key not in ('HTTP_CONTENT_TYPE', 'HTTP_CONTENT_LENGTH'):
            environ[key] = value
    
    response = Response.from_app(app, environ)

    return_dict = {
        'statusCode': response.status_code,
        'headers': dict(response.headers)
    }

    if response.data:
        return_dict['body'] = base64.b64encode(response.data).decode('utf-8')
        return_dict['encoding'] = 'base64'

    return return_dict
