"""A basic WSGI application for testing."""


def app(environ, start_response):
    method = environ.get("REQUEST_METHOD", "GET")
    path = environ.get("PATH_INFO", "/")
    query = environ.get("QUERY_STRING", "")

    body = f"{method} {path}"
    if query:
        body += f"?{query}"

    start_response("200 OK", [("Content-Type", "text/plain")])
    return [body.encode()]
