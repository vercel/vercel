import logging
import time
from http.server import BaseHTTPRequestHandler

from vercel_runtime.wait_until import wait_until


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/error":
            wait_until(_background_error)
        else:
            wait_until(_background_log)

        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"ok")


def _background_log() -> None:
    time.sleep(0.2)
    logging.info("wait-until-http-finished")


def _background_error() -> None:
    time.sleep(0.1)
    raise RuntimeError("wait-until-http-error")
