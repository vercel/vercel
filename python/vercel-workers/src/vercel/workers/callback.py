from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from vercel.workers._queue.callback import (
    CLOUD_EVENT_TYPE_V2BETA,
    CloudEvent,
    CloudEventData,
    ParsedV2BetaCallback,
    is_v2beta_callback,
    parse_cloudevent,
    parse_v2beta_callback,
)
from vercel.workers._queue.receive import (
    AsyncVisibilityExtender,
    ReceivedMessage,
    VisibilityExtender,
    change_visibility,
    change_visibility_async,
    delete_message,
    delete_message_async,
    parse_multipart_message,
    parse_multipart_messages,
    parse_retry_after,
    receive_message_by_id,
    receive_message_by_id_async,
    receive_messages,
    receive_messages_async,
)
from vercel.workers._queue.subscribe import (
    PayloadValidationError,
    Subscription as _Subscription,
    invoke_subscriptions as _invoke_subscriptions,
    invoke_subscriptions_async as _invoke_subscriptions_async,
    select_subscriptions as _select_subscriptions,
    subscriptions as _subscriptions,
)
from vercel.workers._queue.types import MessageMetadata
from vercel.workers.asgi import ASGI, build_asgi_app
from vercel.workers.exceptions import VQSError
from vercel.workers.wsgi import json_response, status_reason


@dataclass
class _QueueCallbackState:
    queue_name: str
    consumer_group: str
    message_id: str
    visibility_timeout_seconds: int
    refresh_interval_seconds: float
    is_v2beta: bool
    payload: Any = None
    receipt_handle: str = ""
    delivery_count: int = 0
    created_at: str = ""

    @property
    def metadata(self) -> MessageMetadata:
        return {
            "messageId": self.message_id,
            "deliveryCount": self.delivery_count,
            "createdAt": self.created_at,
            "topic": self.queue_name,
            "consumer": self.consumer_group,
        }


def _callback_visibility_options() -> tuple[int, float]:
    # Mirror the Node defaults (ConsumerGroupOptions): 30s visibility, refresh every 10s.
    return (
        int(os.environ.get("VQS_VISIBILITY_TIMEOUT", "30")),
        float(os.environ.get("VQS_VISIBILITY_REFRESH_INTERVAL", "10")),
    )


def _parse_queue_callback(
    raw_body: bytes,
    environ: dict[str, Any] | None = None,
) -> _QueueCallbackState:
    visibility_timeout_seconds, refresh_interval_seconds = _callback_visibility_options()
    is_v2beta = is_v2beta_callback(environ or {})

    if is_v2beta:
        v2 = parse_v2beta_callback(raw_body, environ or {})
        return _QueueCallbackState(
            queue_name=v2["queueName"],
            consumer_group=v2["consumerGroup"],
            message_id=v2["messageId"],
            visibility_timeout_seconds=visibility_timeout_seconds,
            refresh_interval_seconds=refresh_interval_seconds,
            is_v2beta=True,
            payload=v2["payload"],
            receipt_handle=v2["receiptHandle"],
            delivery_count=v2["deliveryCount"],
            created_at=v2["createdAt"],
        )

    queue_name, consumer_group, message_id = parse_cloudevent(raw_body)
    return _QueueCallbackState(
        queue_name=queue_name,
        consumer_group=consumer_group,
        message_id=message_id,
        visibility_timeout_seconds=visibility_timeout_seconds,
        refresh_interval_seconds=refresh_interval_seconds,
        is_v2beta=False,
    )


def _no_matching_subscribers_response(
    state: _QueueCallbackState,
    subscriptions: list[_Subscription],
) -> tuple[int, list[tuple[str, str]], bytes] | None:
    if _select_subscriptions(state.queue_name, subscriptions):
        return None
    return json_response(
        500,
        {
            "error": "no-matching-subscribers",
            "topic": state.queue_name,
            "consumer": state.consumer_group,
        },
    )


def _start_visibility_extender(
    state: _QueueCallbackState,
) -> VisibilityExtender | None:
    if not state.receipt_handle:
        return None

    extender = VisibilityExtender(
        state.queue_name,
        state.consumer_group,
        state.message_id,
        state.receipt_handle,
        visibility_timeout_seconds=state.visibility_timeout_seconds,
        refresh_interval_seconds=state.refresh_interval_seconds,
    )
    extender.start()
    return extender


def _start_async_visibility_extender(
    state: _QueueCallbackState,
) -> AsyncVisibilityExtender | None:
    if not state.receipt_handle:
        return None

    extender = AsyncVisibilityExtender(
        state.queue_name,
        state.consumer_group,
        state.message_id,
        state.receipt_handle,
        visibility_timeout_seconds=state.visibility_timeout_seconds,
        refresh_interval_seconds=state.refresh_interval_seconds,
    )
    extender.start()
    return extender


def _payload_validation_error_response(
    exc: PayloadValidationError,
) -> tuple[int, list[tuple[str, str]], bytes]:
    print("vercel.workers.handle_queue_callback payload validation error:", str(exc))
    return json_response(500, {"error": "payload-validation"})


def _vqs_error_response(exc: VQSError) -> tuple[int, list[tuple[str, str]], bytes]:
    status_code = getattr(exc, "status_code", None) or 500
    err_payload: dict[str, Any] = {"error": str(exc), "type": exc.__class__.__name__}
    retry_after = getattr(exc, "retry_after", None)
    if isinstance(retry_after, int):
        err_payload["retryAfter"] = retry_after
    body = json_response(int(status_code), err_payload)
    print(
        "vercel.workers.handle_queue_callback error "
        + f"({int(status_code)} {status_reason(int(status_code))}):",
        repr(exc),
    )
    return body


def _internal_error_response(exc: Exception) -> tuple[int, list[tuple[str, str]], bytes]:
    print("vercel.workers.handle_queue_callback error:", repr(exc))
    return json_response(500, {"error": "internal"})


def _receive_callback_message_sync(state: _QueueCallbackState) -> None:
    if state.is_v2beta:
        return

    (
        state.payload,
        state.delivery_count,
        state.created_at,
        state.receipt_handle,
    ) = receive_message_by_id(
        state.queue_name,
        state.consumer_group,
        state.message_id,
        visibility_timeout_seconds=state.visibility_timeout_seconds,
    )


async def _receive_callback_message_async(state: _QueueCallbackState) -> None:
    if state.is_v2beta:
        return

    (
        state.payload,
        state.delivery_count,
        state.created_at,
        state.receipt_handle,
    ) = await receive_message_by_id_async(
        state.queue_name,
        state.consumer_group,
        state.message_id,
        visibility_timeout_seconds=state.visibility_timeout_seconds,
    )


def _ack_delivery_sync(
    state: _QueueCallbackState,
    extender: VisibilityExtender | None,
) -> None:
    if extender is not None:
        extender.finalize(
            lambda: delete_message(
                state.queue_name,
                state.consumer_group,
                state.message_id,
                state.receipt_handle,
            ),
        )
    else:
        delete_message(
            state.queue_name,
            state.consumer_group,
            state.message_id,
            state.receipt_handle,
        )


async def _ack_delivery_async(
    state: _QueueCallbackState,
    extender: AsyncVisibilityExtender | None,
) -> None:
    if extender is not None:
        await extender.finalize(
            lambda: delete_message_async(
                state.queue_name,
                state.consumer_group,
                state.message_id,
                state.receipt_handle,
            ),
        )
    else:
        await delete_message_async(
            state.queue_name,
            state.consumer_group,
            state.message_id,
            state.receipt_handle,
        )


def _settle_delivery_sync(
    state: _QueueCallbackState,
    timeout_seconds: int | None,
    extender: VisibilityExtender | None,
) -> None:
    if not state.receipt_handle:
        return

    if timeout_seconds is not None:
        if extender is not None:
            extender.finalize(
                lambda: change_visibility(
                    state.queue_name,
                    state.consumer_group,
                    state.message_id,
                    state.receipt_handle,
                    int(timeout_seconds),
                ),
            )
        else:
            change_visibility(
                state.queue_name,
                state.consumer_group,
                state.message_id,
                state.receipt_handle,
                int(timeout_seconds),
            )
        return

    _ack_delivery_sync(state, extender)


async def _settle_delivery_async(
    state: _QueueCallbackState,
    timeout_seconds: int | None,
    extender: AsyncVisibilityExtender | None,
) -> None:
    if not state.receipt_handle:
        return

    if timeout_seconds is not None:
        if extender is not None:
            await extender.finalize(
                lambda: change_visibility_async(
                    state.queue_name,
                    state.consumer_group,
                    state.message_id,
                    state.receipt_handle,
                    int(timeout_seconds),
                ),
            )
        else:
            await change_visibility_async(
                state.queue_name,
                state.consumer_group,
                state.message_id,
                state.receipt_handle,
                int(timeout_seconds),
            )
        return

    await _ack_delivery_async(state, extender)


def handle_queue_callback(
    raw_body: bytes,
    environ: dict[str, Any] | None = None,
    subscriptions: list[_Subscription] = _subscriptions,
) -> tuple[int, list[tuple[str, str]], bytes]:
    """
    Synchronous queue callback handler used by WSGI wrappers.

    Returns: (status_code, headers, body_bytes)
    """

    extender: VisibilityExtender | None = None
    try:
        if not subscriptions:
            return json_response(500, {"error": "no-subscribers"})

        state = _parse_queue_callback(raw_body, environ)
        no_matching_subscribers = _no_matching_subscribers_response(state, subscriptions)
        if no_matching_subscribers is not None:
            return no_matching_subscribers

        _receive_callback_message_sync(state)
        extender = _start_visibility_extender(state)

        try:
            timeout_seconds = _invoke_subscriptions(
                state.payload,
                state.metadata,
                subscriptions,
            )
        except PayloadValidationError as exc:
            return _payload_validation_error_response(exc)

        _settle_delivery_sync(state, timeout_seconds, extender)
        return json_response(200, {"ok": True})
    except ValueError as exc:
        return json_response(400, {"error": str(exc)})
    except VQSError as exc:
        return _vqs_error_response(exc)
    except Exception as exc:  # noqa: BLE001
        return _internal_error_response(exc)
    finally:
        if extender is not None:
            extender.stop()


async def handle_queue_callback_async(
    raw_body: bytes,
    environ: dict[str, Any] | None = None,
    subscriptions: list[_Subscription] = _subscriptions,
) -> tuple[int, list[tuple[str, str]], bytes]:
    """
    Async queue callback handler used by ASGI wrappers.

    Returns: (status_code, headers, body_bytes)
    """

    extender: AsyncVisibilityExtender | None = None
    try:
        if not subscriptions:
            return json_response(500, {"error": "no-subscribers"})

        state = _parse_queue_callback(raw_body, environ)
        no_matching_subscribers = _no_matching_subscribers_response(state, subscriptions)
        if no_matching_subscribers is not None:
            return no_matching_subscribers

        await _receive_callback_message_async(state)
        extender = _start_async_visibility_extender(state)

        try:
            timeout_seconds = await _invoke_subscriptions_async(
                state.payload,
                state.metadata,
                subscriptions,
            )
        except PayloadValidationError as exc:
            return _payload_validation_error_response(exc)

        await _settle_delivery_async(state, timeout_seconds, extender)
        return json_response(200, {"ok": True})
    except ValueError as exc:
        return json_response(400, {"error": str(exc)})
    except VQSError as exc:
        return _vqs_error_response(exc)
    except Exception as exc:  # noqa: BLE001
        return _internal_error_response(exc)
    finally:
        if extender is not None:
            await extender.stop()


def build_asgi_app_for_subscriptions(subscriptions: list[_Subscription]) -> ASGI:
    async def handle(
        raw_body: bytes,
        environ: dict[str, Any],
    ) -> tuple[int, list[tuple[str, str]], bytes]:
        return await handle_queue_callback_async(raw_body, environ, subscriptions)

    return build_asgi_app(handle)


__all__ = [
    "CLOUD_EVENT_TYPE_V2BETA",
    "AsyncVisibilityExtender",
    "CloudEvent",
    "CloudEventData",
    "ParsedV2BetaCallback",
    "PayloadValidationError",
    "ReceivedMessage",
    "VisibilityExtender",
    "change_visibility",
    "change_visibility_async",
    "delete_message",
    "delete_message_async",
    "build_asgi_app_for_subscriptions",
    "handle_queue_callback",
    "handle_queue_callback_async",
    "is_v2beta_callback",
    "parse_cloudevent",
    "parse_multipart_message",
    "parse_multipart_messages",
    "parse_retry_after",
    "parse_v2beta_callback",
    "receive_message_by_id",
    "receive_message_by_id_async",
    "receive_messages",
    "receive_messages_async",
]
