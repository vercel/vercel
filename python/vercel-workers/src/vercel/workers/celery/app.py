from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

from .. import callback as queue_callback
from ..asgi import build_asgi_app
from ..exceptions import VQSError
from ..wsgi import build_wsgi_app, status_reason
from .transport import TransportConfig
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

    return build_wsgi_app(
        lambda raw_body, environ: handle_queue_callback(celery_app, raw_body, environ)
    )


def get_asgi_app(celery_app: CeleryApp) -> ASGI:
    """Return an ASGI app that executes Celery tasks from Vercel Queue callbacks."""

    return build_asgi_app(
        lambda raw_body, environ: handle_queue_callback(celery_app, raw_body, environ)
    )


def handle_queue_callback(
    celery_app: CeleryApp,
    raw_body: bytes,
    environ: dict[str, Any] | None = None,
) -> tuple[int, list[tuple[str, str]], bytes]:
    """
    Core callback handler shared by WSGI/ASGI wrappers.

    Returns: (status_code, headers, body_bytes)
    """

    extender: queue_callback.VisibilityExtender | None = None
    try:
        conf = getattr(celery_app, "conf", None)
        transport_options = getattr(conf, "broker_transport_options", None)
        cfg = TransportConfig.from_transport_options(
            transport_options if isinstance(transport_options, dict) else {},
        )

        is_v2beta = queue_callback.is_v2beta_callback(environ or {})

        if is_v2beta:
            v2 = queue_callback.parse_v2beta_callback(raw_body, environ or {})
            queue_name = v2["queueName"]
            consumer_group = v2["consumerGroup"]
            message_id = v2["messageId"]
            receipt_handle = v2["receiptHandle"]
            delivery_count = v2["deliveryCount"]
            created_at = v2["createdAt"]
            payload: Any = v2["payload"]
        else:
            queue_name, consumer_group, message_id = queue_callback.parse_cloudevent(raw_body)
            (
                payload,
                delivery_count,
                created_at,
                receipt_handle,
            ) = queue_callback.receive_message_by_id(
                queue_name,
                consumer_group,
                message_id,
                visibility_timeout_seconds=cfg.visibility_timeout_seconds,
                timeout=cfg.timeout,
            )

        extender = queue_callback.VisibilityExtender(
            queue_name,
            consumer_group,
            message_id,
            receipt_handle,
            visibility_timeout_seconds=cfg.visibility_timeout_seconds,
            refresh_interval_seconds=cfg.visibility_refresh_interval_seconds,
            timeout=cfg.timeout,
        )
        extender.start()

        # Execute
        outcome = _execute_envelope(celery_app, payload)
        timeout_seconds = outcome.get("timeoutSeconds")

        # Ack or delay
        if receipt_handle:
            if timeout_seconds is not None:
                if extender is not None:
                    extender.finalize(
                        lambda: queue_callback.change_visibility(
                            queue_name,
                            consumer_group,
                            message_id,
                            receipt_handle,
                            int(timeout_seconds),
                            timeout=cfg.timeout,
                        ),
                    )
                else:
                    queue_callback.change_visibility(
                        queue_name,
                        consumer_group,
                        message_id,
                        receipt_handle,
                        int(timeout_seconds),
                        timeout=cfg.timeout,
                    )
            else:
                if extender is not None:
                    extender.finalize(
                        lambda: queue_callback.delete_message(
                            queue_name,
                            consumer_group,
                            message_id,
                            receipt_handle,
                            timeout=cfg.timeout,
                        ),
                    )
                else:
                    queue_callback.delete_message(
                        queue_name,
                        consumer_group,
                        message_id,
                        receipt_handle,
                        timeout=cfg.timeout,
                    )

        body = json.dumps(
            {
                "ok": True,
                "queue": queue_name,
                "consumer": consumer_group,
                "messageId": message_id,
                "deliveryCount": delivery_count,
                "createdAt": created_at,
                "delayed": bool(timeout_seconds is not None),
                **({"timeoutSeconds": int(timeout_seconds)} if timeout_seconds is not None else {}),
            },
        ).encode("utf-8")
        return (
            200,
            [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
            body,
        )
    except ValueError as exc:
        # CloudEvent parsing/validation errors are client errors.
        err = json.dumps({"error": str(exc), "type": exc.__class__.__name__}).encode("utf-8")
        return (
            400,
            [("Content-Type", "application/json"), ("Content-Length", str(len(err)))],
            err,
        )
    except VQSError as exc:
        status_code = getattr(exc, "status_code", None) or 500
        err_payload: dict[str, Any] = {"error": str(exc), "type": exc.__class__.__name__}

        retry_after = getattr(exc, "retry_after", None)
        if isinstance(retry_after, int):
            err_payload["retryAfter"] = retry_after

        body = json.dumps(err_payload).encode("utf-8")
        reason = status_reason(int(status_code))
        print(
            f"vercel.workers.celery.handle_queue_callback error ({int(status_code)} {reason}):",
            repr(exc),
        )
        return (
            int(status_code),
            [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
            body,
        )
    except Exception as exc:
        print("vercel.workers.celery.handle_queue_callback error:", repr(exc))
        body = b'{"error":"internal"}'
        return (
            500,
            [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
            body,
        )
    finally:
        if extender is not None:
            extender.stop()
