"""Run a script as if on Hive, whose IPC socket path tests cannot create.

The script sees Hive's IPC path in ``VERCEL_IPC_PATH``, and connecting to it
reaches the socket that ``VERCEL_IPC_PATH`` named when this wrapper started.
"""

from __future__ import annotations

import os
import socket
import sys
from unittest import mock

_HIVE_IPC_PATH = "/opt/vercel/ipc.sock"

_ipc_socket_path = os.environ["VERCEL_IPC_PATH"]
os.environ["VERCEL_IPC_PATH"] = _HIVE_IPC_PATH
_connect = socket.socket.connect


def _redirecting_connect(
    self: socket.socket,
    address: str | tuple[object, ...],
) -> None:
    if address == _HIVE_IPC_PATH:
        address = _ipc_socket_path
    _connect(self, address)


# Run the target script (first arg after this wrapper)
target = sys.argv[1]
sys.argv[:] = sys.argv[1:]
with open(target) as f:
    code = compile(f.read(), target, "exec")
with mock.patch.object(socket.socket, "connect", _redirecting_connect):
    exec(code, {"__name__": "__main__", "__file__": target})
