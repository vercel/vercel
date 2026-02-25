from __future__ import annotations

import contextlib

from .app import (
    DEFAULT_BROKER_ALIAS,
    Celery,
    broker_url,
    get_asgi_app,
    get_wsgi_app,
)
from .transport import Transport, install_kombu_transport_alias
from .worker import PollingWorker

__all__ = [
    "Celery",
    "DEFAULT_BROKER_ALIAS",
    "PollingWorker",
    "Transport",
    "broker_url",
    "get_asgi_app",
    "get_wsgi_app",
    "install_kombu_transport_alias",
]

with contextlib.suppress(Exception):
    install_kombu_transport_alias(alias=DEFAULT_BROKER_ALIAS)
