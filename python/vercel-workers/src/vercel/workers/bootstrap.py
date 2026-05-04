from __future__ import annotations

import os
from typing import Any

import vercel.workers.callback as callback

from ._queue.subscribe import (
    PayloadValidationError,
    Subscription,
    invoke_subscriptions,
    select_subscriptions,
)
from ._queue.types import MessageMetadata
from .asgi import ASGI, build_asgi_app
from .exceptions import VQSError
from .wsgi import WSGI, build_wsgi_app, json_response, status_reason

__all__ = [
    "PayloadValidationError",
    "build_asgi_queue_app",
    "build_wsgi_queue_app",
    "callback",
    "handle_queue_callback",
]


def _delete_message_sync(
    queue_name: str,
    consumer_group: str,
    message_id: str,
    receipt_handle: str,
    extender: callback.VisibilityExtender | None,
) -> None:
    if extender is not None:
        extender.finalize(
            lambda: callback.delete_message(
                queue_name,
                consumer_group,
                message_id,
                receipt_handle,
            ),
        )
    else:
        callback.delete_message(
            queue_name,
            consumer_group,
            message_id,
            receipt_handle,
        )


def handle_queue_callback(
    raw_body: bytes,
    environ: dict[str, Any] | None,
    subscriptions: list[Subscription],
) -> tuple[int, list[tuple[str, str]], bytes]:
    """
    Core callback handler used by both WSGI/ASGI wrappers.

    Returns: (status_code, headers, body_bytes)
    """

    extender: callback.VisibilityExtender | None = None
    try:
        if not subscriptions:
            return json_response(500, {"error": "no-subscribers"})

        # Mirror the Node defaults (ConsumerGroupOptions): 30s visibility, refresh every 10s.
        visibility_timeout_seconds = int(os.environ.get("VQS_VISIBILITY_TIMEOUT", "30"))
        refresh_interval_seconds = float(
            os.environ.get("VQS_VISIBILITY_REFRESH_INTERVAL", "10")
        )

        is_v2beta = callback.is_v2beta_callback(environ or {})
        payload: Any = None
        receipt_handle = ""
        delivery_count = 0
        created_at = ""

        if is_v2beta:
            v2 = callback.parse_v2beta_callback(raw_body, environ or {})
            queue_name = v2["queueName"]
            consumer_group = v2["consumerGroup"]
            message_id = v2["messageId"]
            receipt_handle = v2["receiptHandle"]
            delivery_count = v2["deliveryCount"]
            created_at = v2["createdAt"]
            payload = v2["payload"]
        else:
            queue_name, consumer_group, message_id = callback.parse_cloudevent(raw_body)

        # Fail fast if no workers match this topic.
        if not select_subscriptions(queue_name, subscriptions):
            return json_response(
                500,
                {
                    "error": "no-matching-subscribers",
                    "topic": queue_name,
                    "consumer": consumer_group,
                },
            )

        if not is_v2beta:
            payload, delivery_count, created_at, receipt_handle = callback.receive_message_by_id(
                queue_name,
                consumer_group,
                message_id,
                visibility_timeout_seconds=visibility_timeout_seconds,
            )

        metadata: MessageMetadata = {
            "messageId": message_id,
            "deliveryCount": delivery_count,
            "createdAt": created_at,
            "topic": queue_name,
            "consumer": consumer_group,
        }

        if receipt_handle:
            extender = callback.VisibilityExtender(
                queue_name,
                consumer_group,
                message_id,
                receipt_handle,
                visibility_timeout_seconds=visibility_timeout_seconds,
                refresh_interval_seconds=refresh_interval_seconds,
            )
            extender.start()

        # Execute subscribers and ack/delay accordingly.
        try:
            timeout_seconds = invoke_subscriptions(payload, metadata, subscriptions)
        except PayloadValidationError as exc:
            print("vercel.workers.handle_queue_callback payload validation error:", str(exc))
            return json_response(500, {"error": "payload-validation"})

        if receipt_handle:
            if timeout_seconds is not None:
                if extender is not None:
                    extender.finalize(
                        lambda: callback.change_visibility(
                            queue_name,
                            consumer_group,
                            message_id,
                            receipt_handle,
                            int(timeout_seconds),
                        ),
                    )
                else:
                    callback.change_visibility(
                        queue_name,
                        consumer_group,
                        message_id,
                        receipt_handle,
                        int(timeout_seconds),
                    )
            else:
                _delete_message_sync(
                    queue_name,
                    consumer_group,
                    message_id,
                    receipt_handle,
                    extender,
                )

        return json_response(200, {"ok": True})
    except ValueError as exc:
        return json_response(400, {"error": str(exc)})
    except VQSError as exc:
        status_code = getattr(exc, "status_code", None) or 500
        err_payload: dict[str, Any] = {"error": str(exc), "type": exc.__class__.__name__}
        retry_after = getattr(exc, "retry_after", None)
        if isinstance(retry_after, int):
            err_payload["retryAfter"] = retry_after
        body = json_response(int(status_code), err_payload)
        print(
            "vercel.workers.handle_queue_callback error "
            f"({int(status_code)} {status_reason(int(status_code))}):",
            repr(exc),
        )
        return body
    except Exception as exc:  # noqa: BLE001
        print("vercel.workers.handle_queue_callback error:", repr(exc))
        return json_response(500, {"error": "internal"})
    finally:
        if extender is not None:
            extender.stop()


def build_wsgi_queue_app(subscriptions: list[Subscription]) -> WSGI:
    """Return a WSGI app that executes queue worker callbacks."""
    return build_wsgi_app(
        lambda raw_body, environ: handle_queue_callback(
            raw_body,
            environ,
            subscriptions,
        )
    )


def build_asgi_queue_app(subscriptions: list[Subscription]) -> ASGI:
    """Return an ASGI app that executes queue worker callbacks."""
    return build_asgi_app(
        lambda raw_body, environ: handle_queue_callback(
            raw_body,
            environ,
            subscriptions,
        )
    )
