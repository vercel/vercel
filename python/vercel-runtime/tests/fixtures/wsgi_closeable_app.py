"""WSGI app returning an iterator with .close() for testing."""


class ClosingIterator:
    def __init__(self, data):
        self._data = [data]
        self.closed = False

    def __iter__(self):
        return iter(self._data)

    def close(self):
        self.closed = True


def app(environ, start_response):
    method = environ.get("REQUEST_METHOD", "GET")
    path = environ.get("PATH_INFO", "/")
    body = f"{method} {path}".encode()
    start_response("200 OK", [("Content-Type", "text/plain")])
    return ClosingIterator(body)
