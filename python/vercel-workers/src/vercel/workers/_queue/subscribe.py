from __future__ import annotations

import asyncio
import inspect
from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, get_type_hints, overload

from pydantic import TypeAdapter, ValidationError

from vercel.workers._queue.types import MessageMetadata


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


type WorkerCallable = Callable[..., Any | Awaitable[Any]]


class PayloadValidationError(Exception):
    """Raised when SDK payload validation rejects a queue message."""


@dataclass
class InvocationPlan:
    payload_adapter: TypeAdapter[Any] | None
    include_metadata: bool

    def prepare_payload(self, payload: Any) -> Any:
        if self.payload_adapter is None:
            return payload
        try:
            return self.payload_adapter.validate_python(payload)
        except ValidationError as exc:
            raise PayloadValidationError(str(exc)) from exc


@dataclass
class Subscription:
    func: WorkerCallable
    topic_filter: Callable[[str | None], bool] | None = None
    topic_desc: str | None = None
    invocation: InvocationPlan | None = None

    def matches(self, topic: str | None) -> bool:
        if self.topic_filter is not None:
            if not self.topic_filter(topic):
                return False
        return True


subscriptions: list[Subscription] = []


def _is_untyped_payload_annotation(annotation: Any) -> bool:
    return annotation is inspect.Signature.empty or annotation is Any


def build_invocation_plan(func: WorkerCallable) -> InvocationPlan:
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
    return InvocationPlan(
        payload_adapter=payload_adapter,
        include_metadata=len(positional_params) >= 2,
    )


def call_subscription(sub: Subscription, message: Any, metadata: MessageMetadata) -> Any:
    invocation = sub.invocation
    if invocation is None:
        invocation = build_invocation_plan(sub.func)
        sub.invocation = invocation

    payload = invocation.prepare_payload(message)
    if invocation.include_metadata:
        return sub.func(payload, metadata)
    return sub.func(payload)


async def _await_result(result: Awaitable[Any]) -> Any:
    return await result


def register_subscription(
    registry: list[Subscription],
    func: WorkerCallable,
    *,
    topic_filter: Callable[[str | None], bool] | None,
    topic_desc: str | None,
) -> WorkerCallable:
    registry.append(
        Subscription(
            func=func,
            topic_filter=topic_filter,
            topic_desc=topic_desc,
            invocation=build_invocation_plan(func),
        )
    )
    return func


def build_subscribe_decorator(
    registry: list[Subscription],
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
        return register_subscription(
            registry,
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
    if _func is not None:
        return build_subscribe_decorator(subscriptions, topic)(_func)
    return build_subscribe_decorator(subscriptions, topic)


def has_subscriptions(registry: list[Subscription] = subscriptions) -> bool:
    return bool(registry)


def select_subscriptions(
    topic: str | None,
    registry: Iterable[Subscription] = subscriptions,
) -> Iterable[Subscription]:
    return [s for s in registry if s.matches(topic)]


def result_timeout_seconds(result: Any, current: int | None) -> int | None:
    if isinstance(result, RetryAfter):
        return result.timeout_seconds
    return current


def invoke_subscriptions(
    message: Any,
    metadata: MessageMetadata,
    registry: Iterable[Subscription] = subscriptions,
) -> int | None:
    """
    Invoke all matching subscriptions and return an optional retry delay.

    Only Ack and RetryAfter are interpreted as worker directives. Any other return
    value is treated as successful completion.
    """
    topic = metadata.get("topic")
    timeout_seconds: int | None = None

    for sub in select_subscriptions(topic, registry):
        try:
            result = call_subscription(sub, message, metadata)
            if asyncio.iscoroutine(result) or isinstance(result, asyncio.Future):
                result = asyncio.run(_await_result(result))
        except Ack:
            return None
        except RetryAfter as directive:
            return directive.timeout_seconds
        except Exception:
            raise

        if isinstance(result, Ack):
            return None
        timeout_seconds = result_timeout_seconds(result, timeout_seconds)

    return timeout_seconds


async def invoke_subscriptions_async(
    message: Any,
    metadata: MessageMetadata,
    registry: Iterable[Subscription] = subscriptions,
) -> int | None:
    """
    Invoke all matching subscriptions from an async callback path.
    """
    topic = metadata.get("topic")
    timeout_seconds: int | None = None

    for sub in select_subscriptions(topic, registry):
        try:
            if inspect.iscoroutinefunction(sub.func):
                result = call_subscription(sub, message, metadata)
            else:
                result = await asyncio.to_thread(call_subscription, sub, message, metadata)
            if inspect.isawaitable(result):
                result = await result
        except Ack:
            return None
        except RetryAfter as directive:
            return directive.timeout_seconds
        except Exception:
            raise

        if isinstance(result, Ack):
            return None
        timeout_seconds = result_timeout_seconds(result, timeout_seconds)

    return timeout_seconds


__all__ = [
    "Ack",
    "PayloadValidationError",
    "RetryAfter",
    "Subscription",
    "WorkerCallable",
    "build_subscribe_decorator",
    "has_subscriptions",
    "invoke_subscriptions",
    "invoke_subscriptions_async",
    "select_subscriptions",
    "subscribe",
    "subscriptions",
]
