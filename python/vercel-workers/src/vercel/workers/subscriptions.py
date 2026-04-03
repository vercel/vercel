from __future__ import annotations

import asyncio
import os
from collections.abc import Awaitable, Callable, Coroutine, Iterable, Mapping
from dataclasses import dataclass
from functools import wraps
from typing import Any, Protocol, cast, overload

from . import callback as queue_callback
from .asgi import ASGI, build_asgi_app
from .client import QueueClient
from .exceptions import InternalServerError
from .types import MessageMetadata, WorkerTimeoutResult
from .wsgi import WSGI, build_wsgi_app, json_response


class WorkerCallable(Protocol):
    def __call__(self, message: Any, metadata: MessageMetadata) -> Any | Awaitable[Any]: ...


@dataclass(frozen=True)
class _Subscription:
    func: WorkerCallable
    topic_filter: Callable[[str | None], bool] | None = None
    topic_desc: str | None = None
    consumer: str | None = None

    def matches(
        self,
        topic_name: str | None,
        consumer_group: str | None = None,
        *,
        ignore_consumer: bool = False,
    ) -> bool:
        if self.topic_filter is not None and not self.topic_filter(topic_name):
            return False
        if not ignore_consumer and self.consumer is not None and self.consumer != consumer_group:
            return False
        return True


_subscriptions: list[_Subscription] = []


@overload
def subscribe(_func: WorkerCallable) -> WorkerCallable: ...


@overload
def subscribe(
    *,
    topic: str | tuple[str, Callable[[str | None], bool]] | None = None,
    consumer: str | None = None,
) -> Callable[[WorkerCallable], WorkerCallable]: ...


def subscribe(
    _func: WorkerCallable | None = None,
    *,
    topic: str | tuple[str, Callable[[str | None], bool]] | None = None,
    consumer: str | None = None,
) -> Callable[[WorkerCallable], WorkerCallable] | WorkerCallable:
    """Register a queue worker function."""

    topic_filter: Callable[[str | None], bool] | None
    if isinstance(topic, str):

        def topic_filter(topic_name: str | None) -> bool:
            return topic_name == topic

        topic_desc = topic
    elif isinstance(topic, tuple):
        topic_desc, topic_filter = topic
    else:
        topic_filter = None
        topic_desc = None

    def decorator(func: WorkerCallable) -> WorkerCallable:
        _subscriptions.append(
            _Subscription(
                func=func,
                topic_filter=topic_filter,
                topic_desc=topic_desc,
                consumer=consumer,
            )
        )

        @wraps(func)
        def wrapper(message: Any, metadata: MessageMetadata) -> Any:
            return func(message, metadata)

        return wrapper  # type: ignore[return-value]

    if _func is not None:
        return decorator(_func)
    return decorator


def has_subscriptions() -> bool:
    return bool(_subscriptions)


def _select_subscriptions(
    topic_name: str | None,
    consumer_group: str | None,
    *,
    ignore_consumer: bool = False,
) -> Iterable[_Subscription]:
    return [
        subscription
        for subscription in _subscriptions
        if subscription.matches(topic_name, consumer_group, ignore_consumer=ignore_consumer)
    ]


def _invoke_subscriptions(
    message: Any,
    metadata: MessageMetadata,
    *,
    ignore_consumer: bool = False,
) -> int | None:
    timeout_seconds: int | None = None

    for subscription in _select_subscriptions(
        metadata.get("topicName"),
        metadata.get("consumerGroup"),
        ignore_consumer=ignore_consumer,
    ):
        result = subscription.func(message, metadata)
        if asyncio.iscoroutine(result):
            result = asyncio.run(cast(Coroutine[Any, Any, Any], result))
        if isinstance(result, dict):
            timeout_value = result.get("timeoutSeconds")
            if timeout_value is None:
                continue
            try:
                timeout_seconds = int(timeout_value)
            except (TypeError, ValueError):
                pass

    return timeout_seconds


def _handle_subscribed_message(
    message: Any,
    metadata: MessageMetadata,
) -> WorkerTimeoutResult | None:
    if not _select_subscriptions(metadata["topicName"], metadata["consumerGroup"]):
        raise InternalServerError(
            "No matching subscribers registered for "
            f"topic={metadata['topicName']!r} consumer={metadata['consumerGroup']!r}",
        )

    timeout_seconds = _invoke_subscriptions(message, metadata)
    if timeout_seconds is None:
        return None
    return {"timeoutSeconds": timeout_seconds}


def handle_queue_callback(
    raw_body: bytes,
    headers: Mapping[str, str],
) -> tuple[int, list[tuple[str, str]], bytes]:
    if not _subscriptions:
        return json_response(500, {"error": "no-subscribers"})

    visibility_timeout_seconds = int(os.environ.get("VQS_VISIBILITY_TIMEOUT", "30"))
    refresh_interval_seconds = float(os.environ.get("VQS_VISIBILITY_REFRESH_INTERVAL", "10"))
    return queue_callback.handle_callback(
        QueueClient(),
        raw_body,
        headers,
        _handle_subscribed_message,
        visibility_timeout_seconds=visibility_timeout_seconds,
        refresh_interval_seconds=refresh_interval_seconds,
        context="vercel.workers.handle_queue_callback",
    )


def get_wsgi_app() -> WSGI:
    """Return a WSGI app that executes subscribed workers from Vercel Queue callbacks."""
    return build_wsgi_app(handle_queue_callback)


def get_asgi_app() -> ASGI:
    """Return an ASGI app that executes subscribed workers from Vercel Queue callbacks."""
    return build_asgi_app(handle_queue_callback)


__all__ = [
    "get_asgi_app",
    "get_wsgi_app",
    "has_subscriptions",
    "subscribe",
]
