from py_shared import greet


def app(environ, start_response):
    body = greet("py-b").encode()
    start_response("200 OK", [("Content-Type", "text/plain")])
    return [body]
