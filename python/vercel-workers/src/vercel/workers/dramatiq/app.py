from __future__ import annotations

import math
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, replace
from typing import Any

from .. import callback as queue_callback
from ..asgi import build_asgi_app
from ..client import MessageMetadata
from ..wsgi import build_wsgi_app
from .broker import VercelQueuesBroker, _envelope_to_message, build_queue_client

try:
    import dramatiq
    from dramatiq.common import current_millis
    from dramatiq.message import Message
except Exception as e:
    raise RuntimeError(
        "dramatiq is required to use vercel.workers.dramatiq. "
        "Install it with `pip install 'vercel-workers[dramatiq]'` or `pip install dramatiq`.",
    ) from e


__all__ = [
    "DramatiqWorkerConfig",
    "get_wsgi_app",
    "get_asgi_app",
    "handle_queue_callback",
]


ASGI = Callable[
    [
        dict[str, Any],
        Callable[[], Awaitable[dict[str, Any]]],
        Callable[[dict[str, Any]], Awaitable[None]],
    ],
    Awaitable[None],
]
WSGI = Callable[[dict[str, Any], Callable[..., Any]], list[bytes]]


@dataclass(frozen=True, slots=True)
class DramatiqWorkerConfig:
    """
    Runtime config used by the callback route.

    This controls how we receive/lock and retry messages.
    """

    visibility_timeout_seconds: int = 30
    visibility_refresh_interval_seconds: float = 10.0
    timeout: float | None = 10.0

    # Retry policy for task exceptions.
    max_retries: int = 3
    retry_backoff_base_ms: int = 5000
    retry_backoff_factor: float = 2.0
    max_retry_delay_ms: int = 60 * 60 * 1000  # 1 hour

    @classmethod
    def from_broker_options(cls, broker: VercelQueuesBroker) -> DramatiqWorkerConfig:
        """Create config from broker options."""
        cfg = cls()
        opts = broker.options

        cfg = replace(cfg, visibility_timeout_seconds=opts.visibility_timeout_seconds)
        cfg = replace(
            cfg, visibility_refresh_interval_seconds=opts.visibility_refresh_interval_seconds
        )
        if opts.timeout is not None:
            cfg = replace(cfg, timeout=opts.timeout)

        return cfg


def get_wsgi_app(broker: VercelQueuesBroker) -> WSGI:
    """
    Build a WSGI callback app that executes Dramatiq tasks from Vercel Queue callbacks.

    Usage: configure a Vercel Queue trigger to POST CloudEvents to this route.

    Example:
        from vercel.workers.dramatiq import VercelQueuesBroker, get_wsgi_app

        broker = VercelQueuesBroker()
        dramatiq.set_broker(broker)

        # Import actors to register them
        from tasks import my_task

        app = get_wsgi_app(broker)
    """
    return build_wsgi_app(
        lambda raw_body, headers: handle_queue_callback(broker, raw_body, headers)
    )


def get_asgi_app(broker: VercelQueuesBroker) -> ASGI:
    """ASGI variant of get_wsgi_app()."""
    return build_asgi_app(
        lambda raw_body, headers: handle_queue_callback(broker, raw_body, headers)
    )


def _retry_delay_ms(cfg: DramatiqWorkerConfig, attempt: int) -> int:
    """
    Compute retry delay with exponential backoff.

    attempt is 1-based.
    """
    delay: float
    base = float(cfg.retry_backoff_base_ms)
    factor = float(cfg.retry_backoff_factor)
    if attempt <= 1:
        delay = base
    else:
        delay = base * math.pow(factor, attempt - 1)
    if not math.isfinite(delay):
        delay = float(cfg.max_retry_delay_ms)
    return int(max(0, min(float(cfg.max_retry_delay_ms), delay)))


def _execute_message(broker: VercelQueuesBroker, message: Message) -> dict[str, Any]:
    """
    Execute a Dramatiq message.

    Returns:
        {"ack": True} on success
        {"timeoutSeconds": N} for retry
    """
    actor = broker.get_actor(message.actor_name)
    if actor is None:
        raise LookupError(f"Dramatiq actor not found: {message.actor_name!r}")

    try:
        # Execute the actor function directly
        # Note: In a full implementation, we'd use Dramatiq's middleware pipeline
        actor(*message.args, **message.kwargs)
        return {"ack": True}
    except dramatiq.Retry as exc:
        # Handle retry with delay
        delay = getattr(exc, "delay", None)
        if delay is not None:
            return {"timeoutSeconds": int(delay / 1000)}
        return {"timeoutSeconds": 60}  # Default retry delay


def _handle_message(
    broker: VercelQueuesBroker,
    payload: Any,
    metadata: MessageMetadata,
) -> dict[str, Any] | None:
    dramatiq_message = _envelope_to_message(payload)
    eta = dramatiq_message.options.get("eta")
    if eta is not None:
        now = current_millis()
        if eta > now:
            return {"timeoutSeconds": int((eta - now) / 1000)}
    outcome = _execute_message(broker, dramatiq_message)
    return outcome if "timeoutSeconds" in outcome else None


def _retry_handler(
    cfg: DramatiqWorkerConfig,
    error: BaseException,
    metadata: MessageMetadata,
) -> queue_callback.RetryDirective | None:
    attempt = int(metadata["deliveryCount"])
    if attempt < int(cfg.max_retries):
        return {"timeoutSeconds": int(_retry_delay_ms(cfg, attempt) / 1000)}
    return {"acknowledge": True}


def handle_queue_callback(
    broker: VercelQueuesBroker,
    raw_body: bytes,
    headers: dict[str, str],
) -> tuple[int, list[tuple[str, str]], bytes]:
    cfg = DramatiqWorkerConfig.from_broker_options(broker)
    client = build_queue_client(broker.options)
    return queue_callback.handle_callback(
        client,
        raw_body,
        headers,
        lambda payload, metadata: _handle_message(broker, payload, metadata),
        visibility_timeout_seconds=cfg.visibility_timeout_seconds,
        refresh_interval_seconds=cfg.visibility_refresh_interval_seconds,
        retry=lambda error, metadata: _retry_handler(cfg, error, metadata),
        context="vercel.workers.dramatiq.handle_queue_callback",
    )
