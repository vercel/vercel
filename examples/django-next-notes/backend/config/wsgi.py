import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

_application = get_wsgi_application()

# Strip the /_/backend prefix added by `vercel dev` before passing to Django
_PREFIX = '/_/backend'

def application(environ, start_response):
    path = environ.get('PATH_INFO', '')
    if path.startswith(_PREFIX):
        environ['PATH_INFO'] = path[len(_PREFIX):] or '/'
    return _application(environ, start_response)
