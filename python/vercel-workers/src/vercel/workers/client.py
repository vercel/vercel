from __future__ import annotations

import json
import os
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, overload
from uuid import uuid4

from ._queue import send as queue_send
from ._queue.subscribe import (
    Ack,
    RetryAfter,
    Subscription as _Subscription,
    WorkerCallable,
    build_subscribe_decorator as _build_subscribe_decorator,
    invoke_subscriptions as _invoke_subscriptions,
    subscriptions as _subscriptions,
)
from ._queue.types import (
    DEPLOYMENT_ID_UNSET,
    DeploymentIdOption,
    Duration,
    MessageMetadata,
    SendMessageResult,
    WorkerJSONEncoder,
    is_duration,
)
from .asgi import ASGI
from .callback import build_asgi_app_for_subscriptions, handle_queue_callback
from .wsgi import WSGI, build_wsgi_app

# Some callers patch this module's `os.environ`; keep the module import live while
# the send implementation lives under `vercel.workers._queue`.
_CLIENT_ENVIRON = os.environ

__all__ = [
    "DEPLOYMENT_ID_UNSET",
    "DeploymentIdOption",
    "Duration",
    "MessageMetadata",
    "Ack",
    "RetryAfter",
    "WorkerJSONEncoder",
    "subscribe",
    "get_wsgi_app",
    "get_asgi_app",
    "has_subscriptions",
    "is_duration",
    "send",
    "send_async",
]


_DEPLOYMENT_ID_UNSET = DEPLOYMENT_ID_UNSET
type _DeploymentIdOption = DeploymentIdOption


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


def _prepare_in_process_delivery(
    queue_name: str,
    subscriptions: list[_Subscription],
) -> MessageMetadata:
    if not subscriptions:
        raise RuntimeError(
            "No worker subscriptions registered. Import the module containing your "
            + "@subscribe handlers before calling send() in in-process dev mode.",
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
            f"No worker subscriptions found for topic {queue_name!r} "
            + "in in-process dev mode. Known topics: "
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


def get_wsgi_app() -> WSGI:
    """Return a WSGI app that executes subscribed workers from Vercel Queue callbacks."""
    return build_wsgi_app(handle_queue_callback)


def get_asgi_app() -> ASGI:
    """Return an ASGI app that executes subscribed workers from Vercel Queue callbacks."""
    return build_asgi_app_for_subscriptions(_subscriptions)


def get_queue_base_url() -> str:
    return queue_send.get_queue_base_url()


def get_queue_base_path() -> str:
    return queue_send.get_queue_base_path()


def get_queue_token(explicit_token: str | None = None) -> str:
    return queue_send.get_queue_token(explicit_token)


async def get_queue_token_async(explicit_token: str | None = None) -> str:
    return await queue_send.get_queue_token_async(explicit_token)


async def send_async(
    queue_name: str,
    payload: Any,
    *,
    idempotency_key: str | None = None,
    retention: Duration | None = None,
    delay: Duration | None = None,
    retention_seconds: int | None = None,
    delay_seconds: int | None = None,
    deployment_id: DeploymentIdOption = DEPLOYMENT_ID_UNSET,
    token: str | None = None,
    base_url: str | None = None,
    base_path: str | None = None,
    content_type: str = "application/json",
    timeout: float | None = 10.0,
    headers: dict[str, str] | None = None,
    json_encoder: type[json.JSONEncoder] | None = None,
) -> SendMessageResult:
    return await queue_send.send_async(
        queue_name,
        payload,
        idempotency_key=idempotency_key,
        retention=retention,
        delay=delay,
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
    retention: Duration | None = None,
    delay: Duration | None = None,
    retention_seconds: int | None = None,
    delay_seconds: int | None = None,
    deployment_id: DeploymentIdOption = DEPLOYMENT_ID_UNSET,
    token: str | None = None,
    base_url: str | None = None,
    base_path: str | None = None,
    content_type: str = "application/json",
    timeout: float | None = 10.0,
    headers: dict[str, str] | None = None,
    json_encoder: type[json.JSONEncoder] | None = None,
) -> SendMessageResult:
    if queue_send.in_process_mode_enabled():
        return _send_in_process(queue_name, payload)

    return queue_send.send(
        queue_name,
        payload,
        idempotency_key=idempotency_key,
        retention=retention,
        delay=delay,
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
