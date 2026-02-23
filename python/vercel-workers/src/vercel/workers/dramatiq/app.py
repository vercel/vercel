from __future__ import annotations

import json
import math
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, replace
from typing import Any

from .. import callback as queue_callback
from ..asgi import build_asgi_app
from ..exceptions import VQSError
from ..wsgi import build_wsgi_app, status_reason
from .broker import VercelQueuesBroker, _envelope_to_message

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
    return build_wsgi_app(lambda raw_body: handle_queue_callback(broker, raw_body))


def get_asgi_app(broker: VercelQueuesBroker) -> ASGI:
    """ASGI variant of get_wsgi_app()."""
    return build_asgi_app(lambda raw_body: handle_queue_callback(broker, raw_body))


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


def handle_queue_callback(
    broker: VercelQueuesBroker,
    raw_body: bytes,
) -> tuple[int, list[tuple[str, str]], bytes]:
    """
    Core callback handler shared by WSGI/ASGI wrappers.

    Returns: (status_code, headers, body_bytes)
    """
    extender: queue_callback.VisibilityExtender | None = None
    cfg = DramatiqWorkerConfig.from_broker_options(broker)

    try:
        queue_name, consumer_group, message_id = queue_callback.parse_cloudevent(raw_body)

        payload, delivery_count, created_at, ticket = queue_callback.receive_message_by_id(
            queue_name,
            consumer_group,
            message_id,
            visibility_timeout_seconds=cfg.visibility_timeout_seconds,
            timeout=cfg.timeout,
        )

        # Keep the message locked while executing.
        if ticket:
            extender = queue_callback.VisibilityExtender(
                queue_name,
                consumer_group,
                message_id,
                ticket,
                visibility_timeout_seconds=cfg.visibility_timeout_seconds,
                refresh_interval_seconds=cfg.visibility_refresh_interval_seconds,
                timeout=cfg.timeout,
            )
            extender.start()

        # Parse the envelope and convert to Dramatiq message
        dramatiq_message = _envelope_to_message(payload)

        # Handle eta (delayed messages)
        eta = dramatiq_message.options.get("eta")
        if eta is not None:
            now = current_millis()
            if eta > now:
                delay_seconds = int((eta - now) / 1000)
                if ticket:
                    _finalize_visibility(
                        extender,
                        lambda: queue_callback.change_visibility(
                            queue_name,
                            consumer_group,
                            message_id,
                            ticket,
                            delay_seconds,
                            timeout=cfg.timeout,
                        ),
                    )
                body = json.dumps(
                    {
                        "ok": True,
                        "delayed": True,
                        "timeoutSeconds": delay_seconds,
                        "queue": queue_name,
                        "consumer": consumer_group,
                        "messageId": message_id,
                        "deliveryCount": delivery_count,
                        "createdAt": created_at,
                    }
                ).encode("utf-8")
                return (
                    200,
                    [
                        ("Content-Type", "application/json"),
                        ("Content-Length", str(len(body))),
                    ],
                    body,
                )

        try:
            # Execute the task
            outcome = _execute_message(broker, dramatiq_message)
            timeout_seconds = outcome.get("timeoutSeconds")

            if timeout_seconds is not None:
                if ticket:
                    _finalize_visibility(
                        extender,
                        lambda: queue_callback.change_visibility(
                            queue_name,
                            consumer_group,
                            message_id,
                            ticket,
                            int(timeout_seconds),
                            timeout=cfg.timeout,
                        ),
                    )
                body = json.dumps(
                    {
                        "ok": True,
                        "delayed": True,
                        "timeoutSeconds": int(timeout_seconds),
                        "queue": queue_name,
                        "consumer": consumer_group,
                        "messageId": message_id,
                        "deliveryCount": delivery_count,
                        "createdAt": created_at,
                    }
                ).encode("utf-8")
                return (
                    200,
                    [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
                    body,
                )

            # Success: ack (delete) the message
            if ticket:
                _finalize_visibility(
                    extender,
                    lambda: queue_callback.delete_message(
                        queue_name,
                        consumer_group,
                        message_id,
                        ticket,
                        timeout=cfg.timeout,
                    ),
                )

            body = json.dumps(
                {
                    "ok": True,
                    "queue": queue_name,
                    "consumer": consumer_group,
                    "messageId": message_id,
                    "deliveryCount": delivery_count,
                    "createdAt": created_at,
                }
            ).encode("utf-8")
            return (
                200,
                [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
                body,
            )

        except KeyboardInterrupt:
            raise
        except Exception as exc:
            # Handle task execution error with retry logic
            attempt = delivery_count

            if attempt < int(cfg.max_retries):
                delay_ms = _retry_delay_ms(cfg, attempt)
                delay_seconds = int(delay_ms / 1000)

                if ticket:
                    _finalize_visibility(
                        extender,
                        lambda: queue_callback.change_visibility(
                            queue_name,
                            consumer_group,
                            message_id,
                            ticket,
                            int(delay_seconds),
                            timeout=cfg.timeout,
                        ),
                    )

                body = json.dumps(
                    {
                        "ok": True,
                        "delayed": True,
                        "timeoutSeconds": delay_seconds,
                        "queue": queue_name,
                        "consumer": consumer_group,
                        "messageId": message_id,
                        "deliveryCount": delivery_count,
                        "createdAt": created_at,
                        "error": str(exc),
                        "errorType": type(exc).__name__,
                    }
                ).encode("utf-8")
                return (
                    200,
                    [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
                    body,
                )

            # Terminal failure: ack (delete) to prevent infinite retries
            if ticket:
                _finalize_visibility(
                    extender,
                    lambda: queue_callback.delete_message(
                        queue_name,
                        consumer_group,
                        message_id,
                        ticket,
                        timeout=cfg.timeout,
                    ),
                )

            body = json.dumps(
                {
                    "ok": False,
                    "failed": True,
                    "queue": queue_name,
                    "consumer": consumer_group,
                    "messageId": message_id,
                    "deliveryCount": delivery_count,
                    "createdAt": created_at,
                    "error": str(exc),
                    "errorType": type(exc).__name__,
                }
            ).encode("utf-8")
            return (
                200,
                [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
                body,
            )

    except ValueError as exc:
        err = json.dumps(
            {"error": str(exc), "type": exc.__class__.__name__},
        ).encode("utf-8")
        return (
            400,
            [
                ("Content-Type", "application/json"),
                ("Content-Length", str(len(err))),
            ],
            err,
        )
    except VQSError as exc:
        # Queue service errors (locked, not found, etc.)
        status_code = getattr(exc, "status_code", None) or 500
        err_payload: dict[str, Any] = {"error": str(exc), "type": exc.__class__.__name__}

        retry_after = getattr(exc, "retry_after", None)
        if isinstance(retry_after, int):
            err_payload["retryAfter"] = retry_after

        body = json.dumps(err_payload).encode("utf-8")
        reason = status_reason(int(status_code))
        print(
            f"vercel.workers.dramatiq.handle_queue_callback error ({int(status_code)} {reason}):",
            repr(exc),
        )
        return (
            int(status_code),
            [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
            body,
        )
    except Exception as exc:  # noqa: BLE001
        print(
            f"vercel.workers.dramatiq.handle_queue_callback error ({500} {status_reason(500)}):",
            repr(exc),
        )
        err = json.dumps({"error": "internal"}).encode("utf-8")
        return (
            500,
            [
                ("Content-Type", "application/json"),
                ("Content-Length", str(len(err))),
            ],
            err,
        )
    finally:
        if extender is not None:
            extender.stop()


def _finalize_visibility(
    extender: queue_callback.VisibilityExtender | None,
    fn: Callable[[], None],
) -> None:
    if extender is not None:
        extender.finalize(fn)
    else:
        fn()
