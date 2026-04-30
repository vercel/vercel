from __future__ import annotations

import asyncio
import inspect
import json
import os
from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol, TypedDict, cast, get_type_hints, overload
from uuid import uuid4

from pydantic import TypeAdapter, ValidationError

from . import _queue, callback
from .asgi import ASGI, build_asgi_app
from .exceptions import VQSError
from .wsgi import (
    WSGI,
    build_wsgi_app,
    json_response,
    status_reason,
)

SendMessageResult = _queue.SendMessageResult
WorkerJSONEncoder = _queue.WorkerJSONEncoder

__all__ = [
    "MessageMetadata",
    "Ack",
    "RetryAfter",
    "WorkerJSONEncoder",
    "subscribe",
    "get_wsgi_app",
    "get_asgi_app",
    "has_subscriptions",
    "send",
    "send_async",
]


class MessageMetadata(TypedDict, total=False):
    """Metadata describing a queue message delivery."""

    messageId: str
    deliveryCount: int
    createdAt: str
    topic: str
    consumer: str


class Ack(Exception):
    """Directive that acknowledges a message without retrying it."""

    def __init__(self, reason: object | None = None) -> None:
        self.reason: object | None = reason
        super().__init__(str(reason) if reason is not None else "")


class RetryAfter(Exception):
    """Directive that retries a message after a delay."""

    def __init__(self, delay: int | timedelta, reason: object | None = None) -> None:
        if isinstance(delay, timedelta):
            seconds = delay.total_seconds()
        else:
            seconds = float(delay)
        if seconds < 0:
            seconds = 0
        self.timeout_seconds: int = int(seconds)
        self.reason: object | None = reason
        super().__init__(str(reason) if reason is not None else "")


class PayloadWorkerCallable(Protocol):
    def __call__(self, message: Any) -> Any | Awaitable[Any]: ...


class MetadataWorkerCallable(Protocol):
    def __call__(self, message: Any, metadata: MessageMetadata) -> Any | Awaitable[Any]: ...


type WorkerCallable = PayloadWorkerCallable | MetadataWorkerCallable


class _PayloadValidationError(Exception):
    """Raised when SDK payload validation rejects a queue message."""


@dataclass
class _InvocationPlan:
    payload_adapter: TypeAdapter[Any] | None
    include_metadata: bool

    def prepare_payload(self, payload: Any) -> Any:
        if self.payload_adapter is None:
            return payload
        try:
            return self.payload_adapter.validate_python(payload)
        except ValidationError as exc:
            raise _PayloadValidationError(str(exc)) from exc


@dataclass
class _Subscription:
    func: WorkerCallable
    topic_filter: Callable[[str | None], bool] | None = None
    topic_desc: str | None = None
    invocation: _InvocationPlan | None = None

    def matches(self, topic: str | None) -> bool:
        if self.topic_filter is not None:
            if not self.topic_filter(topic):
                return False
        return True


_subscriptions: list[_Subscription] = []


def _is_untyped_payload_annotation(annotation: Any) -> bool:
    return annotation is inspect.Signature.empty or annotation is Any


def _build_invocation_plan(func: WorkerCallable) -> _InvocationPlan:
    signature = inspect.signature(func)
    positional_params = [
        param
        for param in signature.parameters.values()
        if param.kind
        in {inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD}
    ]
    if not positional_params:
        raise TypeError("queue worker must accept at least one payload parameter")
    if len(positional_params) > 2:
        raise TypeError("queue worker must accept payload or payload and metadata")

    try:
        type_hints = get_type_hints(func)
    except Exception:
        type_hints = {}

    payload_param = positional_params[0]
    payload_annotation = type_hints.get(payload_param.name, payload_param.annotation)
    payload_adapter = (
        None
        if _is_untyped_payload_annotation(payload_annotation)
        else TypeAdapter(payload_annotation)
    )
    return _InvocationPlan(
        payload_adapter=payload_adapter,
        include_metadata=len(positional_params) >= 2,
    )


def _call_subscription(sub: _Subscription, message: Any, metadata: MessageMetadata) -> Any:
    invocation = sub.invocation
    if invocation is None:
        invocation = _build_invocation_plan(sub.func)
        sub.invocation = invocation

    payload = invocation.prepare_payload(message)
    if invocation.include_metadata:
        return cast(MetadataWorkerCallable, sub.func)(payload, metadata)
    return cast(PayloadWorkerCallable, sub.func)(payload)


async def _await_result(result: Awaitable[Any]) -> Any:
    return await result


def _register_subscription(
    subscriptions: list[_Subscription],
    func: WorkerCallable,
    *,
    topic_filter: Callable[[str | None], bool] | None,
    topic_desc: str | None,
) -> WorkerCallable:
    subscriptions.append(
        _Subscription(
            func=func,
            topic_filter=topic_filter,
            topic_desc=topic_desc,
            invocation=_build_invocation_plan(func),
        )
    )
    return func


def _build_subscribe_decorator(
    subscriptions: list[_Subscription],
    topic: str | tuple[str, Callable[[str | None], bool]] | None,
) -> Callable[[WorkerCallable], WorkerCallable]:
    topic_filter: Callable[[str | None], bool] | None = None
    topic_desc: str | None = None
    if isinstance(topic, str):

        def exact_topic_filter(t: str | None) -> bool:
            return t == topic

        topic_filter = exact_topic_filter
        topic_desc = topic
    elif isinstance(topic, tuple):
        topic_desc, topic_filter = topic

    def decorator(func: WorkerCallable) -> WorkerCallable:
        return _register_subscription(
            subscriptions,
            func,
            topic_filter=topic_filter,
            topic_desc=topic_desc,
        )

    return decorator


@overload
def subscribe(_func: WorkerCallable) -> WorkerCallable: ...


@overload
def subscribe(
    *, topic: str | tuple[str, Callable[[str | None], bool]] | None = None
) -> Callable[[WorkerCallable], WorkerCallable]: ...


def subscribe(
    _func: WorkerCallable | None = None,
    *,
    topic: str | tuple[str, Callable[[str | None], bool]] | None = None,
) -> Callable[[WorkerCallable], WorkerCallable] | WorkerCallable:
    """
    Register a queue worker function.

    Usage:

        @subscribe
        def worker(message, metadata): ...

        @subscribe(topic="events")
        def billing_worker(message, metadata): ...

        @subscribe(topic=("user-*", lambda t: t.startswith("user-")))
        def user_worker(message, metadata): ...
    """

    if _func is not None:
        # Used as @subscribe without arguments
        return _build_subscribe_decorator(_subscriptions, topic)(_func)

    # Used as @subscribe(...)
    return _build_subscribe_decorator(_subscriptions, topic)


def has_subscriptions() -> bool:
    """Return True if any worker functions have been registered via @subscribe."""
    return bool(_subscriptions)


def _select_subscriptions(
    topic: str | None,
    subscriptions: Iterable[_Subscription] = _subscriptions,
) -> Iterable[_Subscription]:
    return [s for s in subscriptions if s.matches(topic)]


def _result_timeout_seconds(result: Any, current: int | None) -> int | None:
    if isinstance(result, RetryAfter):
        return result.timeout_seconds
    return current


def _invoke_subscriptions(
    message: Any,
    metadata: MessageMetadata,
    subscriptions: Iterable[_Subscription] = _subscriptions,
) -> int | None:
    """
    Invoke all matching subscriptions and return an optional retry delay.

    Only Ack and RetryAfter are interpreted as worker directives. Any other return
    value is treated as successful completion.
    """
    topic = metadata.get("topic")
    timeout_seconds: int | None = None

    for sub in _select_subscriptions(topic, subscriptions):
        try:
            result = _call_subscription(sub, message, metadata)
            if asyncio.iscoroutine(result) or isinstance(result, asyncio.Future):
                result = asyncio.run(_await_result(result))
        except Ack:
            return None
        except RetryAfter as directive:
            return directive.timeout_seconds
        except Exception:
            # Let the outer WSGI handler respond with 500.
            raise

        if isinstance(result, Ack):
            return None
        timeout_seconds = _result_timeout_seconds(result, timeout_seconds)

    return timeout_seconds


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


def _prepare_in_process_delivery(
    queue_name: str,
    subscriptions: list[_Subscription],
) -> MessageMetadata:
    if not subscriptions:
        raise RuntimeError(
            "No worker subscriptions registered. Import the module containing your "
            "@subscribe handlers before calling send() in in-process dev mode.",
        )

    # In dev mode, surface a clear error when there are worker functions but none of
    # them are subscribed to the requested topic. This helps catch mismatches between
    # the queue name used in send() and the topics configured via @subscribe.
    matching_for_topic = [s for s in subscriptions if s.matches(queue_name)]
    if not matching_for_topic:
        available_topics = sorted(
            {s.topic_desc for s in subscriptions if s.topic_desc is not None},
        )
        raise RuntimeError(
            "No worker subscriptions found for topic "
            f"{queue_name!r} in in-process dev mode. "
            "Known topics: "
            + (", ".join(repr(t) for t in available_topics) or "(none with explicit topics)"),
        )

    return {
        "messageId": str(uuid4()),
        "deliveryCount": 1,
        "createdAt": datetime.now(UTC).isoformat(),
        "topic": queue_name,
    }


def _send_in_process(
    queue_name: str,
    payload: Any,
    subscriptions: list[_Subscription] = _subscriptions,
) -> SendMessageResult:
    """
    Development-only, in-process send implementation.

    When ``VERCEL_WORKERS_IN_PROCESS=1``, :func:`send` can short-circuit and invoke
    subscribed workers directly in the current process instead of talking to the
    Queue Service API.

    This mirrors the TypeScript dev experience where callbacks are triggered
    locally, but without any persistence, visibility timeouts, or retries.
    """
    metadata = _prepare_in_process_delivery(queue_name, subscriptions)

    # In dev mode we deliver to all handlers that match the topic (or have no
    # explicit topic), similar to the TypeScript dev.ts behaviour.
    _ = _invoke_subscriptions(payload, metadata, subscriptions)

    message_id = metadata.get("messageId")
    if message_id is None:
        raise RuntimeError("in-process delivery metadata is missing messageId")
    return {"messageId": message_id}


def _handle_queue_callback(
    raw_body: bytes,
    environ: dict[str, Any] | None = None,
    subscriptions: list[_Subscription] = _subscriptions,
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
        refresh_interval_seconds = float(os.environ.get("VQS_VISIBILITY_REFRESH_INTERVAL", "10"))

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
        if not _select_subscriptions(queue_name, subscriptions):
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
            timeout_seconds = _invoke_subscriptions(payload, metadata, subscriptions)
        except _PayloadValidationError as exc:
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


def handle_queue_callback(
    raw_body: bytes,
    environ: dict[str, Any] | None = None,
) -> tuple[int, list[tuple[str, str]], bytes]:
    """
    Core callback handler used by both WSGI/ASGI wrappers.

    Returns: (status_code, headers, body_bytes)
    """

    return _handle_queue_callback(raw_body, environ, _subscriptions)


def _build_asgi_app_for_subscriptions(subscriptions: list[_Subscription]) -> ASGI:
    return build_asgi_app(
        lambda raw_body, environ: _handle_queue_callback(
            raw_body,
            environ,
            subscriptions,
        )
    )


def get_wsgi_app() -> WSGI:
    """Return a WSGI app that executes subscribed workers from Vercel Queue callbacks."""
    return build_wsgi_app(handle_queue_callback)


def get_asgi_app() -> ASGI:
    """Return an ASGI app that executes subscribed workers from Vercel Queue callbacks."""
    return _build_asgi_app_for_subscriptions(_subscriptions)


def get_queue_base_url() -> str:
    return _queue.get_queue_base_url()


def get_queue_base_path() -> str:
    return _queue.get_queue_base_path()


def get_queue_token(explicit_token: str | None = None) -> str:
    return _queue.get_queue_token(explicit_token)


async def get_queue_token_async(explicit_token: str | None = None) -> str:
    return await _queue.get_queue_token_async(explicit_token)


async def send_async(
    queue_name: str,
    payload: Any,
    *,
    idempotency_key: str | None = None,
    retention_seconds: int | None = None,
    delay_seconds: int | None = None,
    deployment_id: _queue.DeploymentIdOption = _queue.DEPLOYMENT_ID_UNSET,
    token: str | None = None,
    base_url: str | None = None,
    base_path: str | None = None,
    content_type: str = "application/json",
    timeout: float | None = 10.0,
    headers: dict[str, str] | None = None,
    json_encoder: type[json.JSONEncoder] | None = None,
) -> SendMessageResult:
    return await _queue.send_message_async(
        queue_name,
        payload,
        idempotency_key=idempotency_key,
        retention_seconds=retention_seconds,
        delay_seconds=delay_seconds,
        deployment_id=deployment_id,
        token=token,
        base_url=base_url,
        base_path=base_path,
        content_type=content_type,
        timeout=timeout,
        headers=headers,
        json_encoder=json_encoder,
    )


def send(
    queue_name: str,
    payload: Any,
    *,
    idempotency_key: str | None = None,
    retention_seconds: int | None = None,
    delay_seconds: int | None = None,
    deployment_id: _queue.DeploymentIdOption = _queue.DEPLOYMENT_ID_UNSET,
    token: str | None = None,
    base_url: str | None = None,
    base_path: str | None = None,
    content_type: str = "application/json",
    timeout: float | None = 10.0,
    headers: dict[str, str] | None = None,
    json_encoder: type[json.JSONEncoder] | None = None,
) -> SendMessageResult:
    if _queue.in_process_mode_enabled():
        return _send_in_process(queue_name, payload)

    return _queue.send_message(
        queue_name,
        payload,
        idempotency_key=idempotency_key,
        retention_seconds=retention_seconds,
        delay_seconds=delay_seconds,
        deployment_id=deployment_id,
        token=token,
        base_url=base_url,
        base_path=base_path,
        content_type=content_type,
        timeout=timeout,
        headers=headers,
        json_encoder=json_encoder,
    )
