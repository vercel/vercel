import logging
import time
from http.server import BaseHTTPRequestHandler

from vercel_runtime.wait_until import wait_until


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/error":
            wait_until(_raise_background_error)
        elif self.path == "/slow":
            wait_until(_slow_background_log)
        else:
            wait_until(_log_background_finished)

        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"ok")


def _log_background_finished() -> None:
    time.sleep(0.2)
    logging.info("wait-until-http-finished")


def _raise_background_error() -> None:
    time.sleep(0.1)
    raise RuntimeError("wait-until-http-error")


def _slow_background_log() -> None:
    time.sleep(0.5)
    logging.info("wait-until-http-slow-finished")
