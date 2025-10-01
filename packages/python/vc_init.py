import sys
import os
from importlib import util as _import_util
from http.server import BaseHTTPRequestHandler

from vc_adapter.utils import (
    add_vendor_to_path,
    init_logging,
    attach_stream_wrappers,
    wrap_print,
    install_urllib3_metrics,
)
from vc_adapter.adapter import (
    create_vc_handler_for_app,
    create_vc_handler_for_request_handler,
    serve_dev_app,
    serve_dev_handler,
    BaseDevHandler,
)


_here = os.path.dirname(__file__)
_vendor_rel = '__VC_HANDLER_VENDOR_DIR'
_vendor = os.path.normpath(os.path.join(_here, _vendor_rel))

add_vendor_to_path(_here, _vendor)


# Import user module from absolute entrypoint
# Import relative path https://docs.python.org/3/library/importlib.html#importing-a-source-file-directly
user_mod_path = os.path.join(_here, "__VC_HANDLER_ENTRYPOINT")
__vc_spec = _import_util.spec_from_file_location("__VC_HANDLER_MODULE_NAME", user_mod_path)
__vc_module = _import_util.module_from_spec(__vc_spec)
sys.modules["__VC_HANDLER_MODULE_NAME"] = __vc_module
__vc_spec.loader.exec_module(__vc_module)
__vc_variables = dir(__vc_module)


# Dev flow with IPC: request-scoped logging/metrics and streaming
if 'VERCEL_IPC_PATH' in os.environ:
    import contextvars

    storage = contextvars.ContextVar('storage', default=None)
    init_logging(storage)
    attach_stream_wrappers(storage)
    wrap_print()
    install_urllib3_metrics(storage)

    BaseHandler = BaseDevHandler.with_storage(storage)

    # Handler-based dev server
    if 'handler' in __vc_variables or 'Handler' in __vc_variables:
        base = __vc_module.handler if ('handler' in __vc_variables) else __vc_module.Handler
        if not issubclass(base, BaseHTTPRequestHandler):
            print('Handler must inherit from BaseHTTPRequestHandler')
            print('See the docs: https://vercel.com/docs/functions/serverless-functions/runtimes/python')
            sys.exit(1)

        serve_dev_handler(base, BaseHandler)

    # App-based dev server (WSGI or ASGI) with streaming, background tasks, and lifespan
    elif 'app' in __vc_variables:
        app = __vc_module.app
        serve_dev_app(app, BaseHandler)

    print('Missing variable `handler` or `app` in file "__VC_HANDLER_ENTRYPOINT".')
    print('See the docs: https://vercel.com/docs/functions/serverless-functions/runtimes/python')
    sys.exit(1)


# Serverless path
if 'handler' in __vc_variables or 'Handler' in __vc_variables:
    # HTTP Handler: forward single request to a local HTTPServer instance
    base = __vc_module.handler if ('handler' in __vc_variables) else __vc_module.Handler
    if not issubclass(base, BaseHTTPRequestHandler):
        print('Handler must inherit from BaseHTTPRequestHandler')
        print('See the docs: https://vercel.com/docs/functions/serverless-functions/runtimes/python')
        sys.exit(1)

    vc_handler = create_vc_handler_for_request_handler(base)

elif 'app' in __vc_variables:
    # WSGI or ASGI app: use adapter
    vc_handler = create_vc_handler_for_app(__vc_module.app)

else:
    print('Missing variable `handler` or `app` in file "__VC_HANDLER_ENTRYPOINT".')
    print('See the docs: https://vercel.com/docs/functions/serverless-functions/runtimes/python')
    sys.exit(1)
