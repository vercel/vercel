from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from .. import callback as queue_callback
from ..asgi import build_asgi_app
from ..wsgi import build_wsgi_app
from .transport import TransportConfig, build_queue_client
from .utils import _execute_envelope

try:
    from celery import Celery as CeleryApp  # type: ignore[import-untyped]
except Exception as e:
    raise RuntimeError(
        "celery is required to use vercel.workers.celery. "
        "Install it with `pip install 'vercel-workers[celery]'` or `pip install celery`.",
    ) from e

ASGI = Callable[
    [
        dict[str, Any],
        Callable[[], Awaitable[dict[str, Any]]],
        Callable[[dict[str, Any]], Awaitable[None]],
    ],
    Awaitable[None],
]
WSGI = Callable[[dict[str, Any], Callable[..., Any]], list[bytes]]


def get_wsgi_app(celery_app: CeleryApp) -> WSGI:
    """Return a WSGI app that executes Celery tasks from Vercel Queue callbacks."""
    return build_wsgi_app(lambda raw_body, headers: handle_queue_callback(celery_app, raw_body, headers))


def get_asgi_app(celery_app: CeleryApp) -> ASGI:
    """Return an ASGI app that executes Celery tasks from Vercel Queue callbacks."""
    return build_asgi_app(lambda raw_body, headers: handle_queue_callback(celery_app, raw_body, headers))


def handle_queue_callback(
    celery_app: CeleryApp,
    raw_body: bytes,
    headers: dict[str, str],
) -> tuple[int, list[tuple[str, str]], bytes]:
    conf = getattr(celery_app, "conf", None)
    transport_options = getattr(conf, "broker_transport_options", None)
    cfg = TransportConfig.from_transport_options(
        transport_options if isinstance(transport_options, dict) else {},
    )
    client = build_queue_client(cfg)
    return queue_callback.handle_callback(
        client,
        raw_body,
        headers,
        lambda payload, metadata: _execute_envelope(celery_app, payload),
        visibility_timeout_seconds=cfg.visibility_timeout_seconds,
        refresh_interval_seconds=cfg.visibility_refresh_interval_seconds,
        context="vercel.workers.celery.handle_queue_callback",
    )
