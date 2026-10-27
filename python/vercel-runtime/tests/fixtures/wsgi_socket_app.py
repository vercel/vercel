"""WSGI app that reports whether its connection has TCP_NODELAY set."""

import json
import socket

original_accept = socket.socket.accept
accepted_connections = []


# WSGI does not expose the client socket, so record it as the server accepts.
def record_accept(self):
    connection, address = original_accept(self)
    accepted_connections.append(connection)
    return connection, address


socket.socket.accept = record_accept


def app(environ, start_response):
    connection = accepted_connections[-1]
    # macOS reports an enabled TCP_NODELAY as 4, not 1.
    nodelay = connection.getsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY)
    body = json.dumps({"nodelay": bool(nodelay)}).encode()
    start_response(
        "200 OK",
        [
            ("Content-Type", "application/json"),
            ("Content-Length", str(len(body))),
        ],
    )
    return [body]
