import json
import socket

from vercel_runtime._vendor.uvicorn import config

config.LOOP_FACTORIES["auto"] = config.LOOP_FACTORIES["asyncio"]
original_accept = socket.socket.accept
accepted = []


def accept(self):
    connection, address = original_accept(self)
    accepted.append(connection)
    return connection, address


socket.socket.accept = accept


async def app(scope, receive, send):
    if scope["type"] != "http":
        return
    connection = accepted[-1]
    body = json.dumps(
        {
            "family": connection.family,
            "protocol": connection.proto,
            "nodelay": connection.getsockopt(
                socket.IPPROTO_TCP, socket.TCP_NODELAY
            ),
        }
    ).encode()
    await send(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [(b"content-length", str(len(body)).encode())],
        }
    )
    await send({"type": "http.response.body", "body": body})
