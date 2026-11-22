def proxy(environ, start_response):
    path = environ.get("PATH_INFO", "/")

    if path == "/block":
        start_response("403 Forbidden", [("Content-Type", "text/plain")])
        return [b"blocked"]

    if path == "/response":
        start_response("200 OK", [("Content-Type", "text/plain")])
        return [b"responded"]

    if path == "/redirect":
        start_response("307 Temporary Redirect", [("Location", "/"), ("Content-Type", "text/plain")])
        return [b""]

    if path == "/rewrite":
        start_response(
            "200 OK",
            [("x-middleware-rewrite", "/rewritten.html"), ("Content-Type", "text/plain")],
        )
        return [b""]

    # Pass-through: x-middleware-next signals the platform to continue to the
    # next matching route (the static index.html).
    start_response(
        "200 OK",
        [("x-middleware-next", "1"), ("x-proxy-ran", "1")],
    )
    return [b""]
