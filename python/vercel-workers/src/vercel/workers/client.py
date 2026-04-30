from __future__ import annotations

import asyncio
import inspect
import json
import os
import warnings
from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any, Protocol, TypedDict, cast, get_type_hints, overload
from urllib.parse import quote
from uuid import UUID, uuid4

import httpx
from pydantic import TypeAdapter, ValidationError

from . import callback
from .asgi import ASGI, build_asgi_app
from .exceptions import (
    BadRequestError,
    DuplicateIdempotencyKeyError,
    ForbiddenError,
    InternalServerError,
    TokenResolutionError,
    UnauthorizedError,
    VQSError,
)
from .wsgi import (
    WSGI,
    build_wsgi_app,
    json_response,
    status_reason,
)

__all__ = [
    "MessageMetadata",
    "Ack",
    "RetryAfter",
    "WorkerJSONEncoder",
    "QueueClient",
    "AsyncQueueClient",
    "Topic",
    "AsyncTopic",
    "subscribe",
    "get_vercel_queue_subscriptions",
    "get_wsgi_app",
    "get_asgi_app",
    "has_subscriptions",
    "send",
]


class WorkerJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder that handles common Python types not supported by the stdlib."""

    def default(self, o: Any) -> Any:
        match o:
            case UUID():
                return str(o)
            case datetime() | date():
                return o.isoformat()
            case Decimal():
                return float(o)
            case _:
                return super().default(o)


class MessageMetadata(TypedDict, total=False):
    """Metadata describing a queue message delivery."""

    messageId: str
    deliveryCount: int
    createdAt: str
    topic: str
    consumer: str


class _DeploymentIdUnset:
    pass


_DEPLOYMENT_ID_UNSET = _DeploymentIdUnset()
type _DeploymentIdOption = str | None | _DeploymentIdUnset


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


class SendMessageResult(TypedDict):
    """Result of sending a message to the queue.

    ``messageId`` is ``None`` when the server returns 202 (deferred delivery).
    """

    messageId: str | None


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


def _in_process_mode_enabled() -> bool:
    return os.environ.get("VERCEL_WORKERS_IN_PROCESS") in {"1", "true", "TRUE", "yes", "YES"}


def _deployment_pinning_disabled_for_dev() -> bool:
    # `vercel dev` configures Python services with this local queue token. Match
    # the TypeScript SDK behavior: deployment IDs are never sent in development.
    return _in_process_mode_enabled() or os.environ.get("VERCEL_QUEUE_TOKEN") == "vc-dev-token"


def _resolve_deployment_id(deployment_id: _DeploymentIdOption) -> str | None:
    if _deployment_pinning_disabled_for_dev():
        return None
    if deployment_id is None:
        return None
    if isinstance(deployment_id, str):
        return deployment_id or None

    env_deployment_id = os.environ.get("VERCEL_DEPLOYMENT_ID")
    if env_deployment_id:
        return env_deployment_id

    raise RuntimeError(
        "No deployment ID available. VERCEL_DEPLOYMENT_ID is not set.\n\n"
        "This usually means the code is running outside a Vercel deployment "
        "(for example during build or in a non-Vercel environment).\n\n"
        "To fix this, provide an explicit deployment_id when sending messages, "
        "or explicitly opt out of deployment pinning with deployment_id=None."
    )


def _build_invocation_plan(
    func: WorkerCallable,
    payload_type: Any = inspect.Signature.empty,
) -> _InvocationPlan:
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
    if _is_untyped_payload_annotation(payload_annotation):
        effective_payload_annotation = payload_type
    else:
        if not _is_untyped_payload_annotation(payload_type) and payload_annotation != payload_type:
            raise TypeError(
                "queue worker payload annotation must match topic payload_type "
                f"({payload_annotation!r} != {payload_type!r})"
            )
        effective_payload_annotation = payload_annotation

    payload_adapter = (
        None
        if _is_untyped_payload_annotation(effective_payload_annotation)
        else TypeAdapter(effective_payload_annotation)
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
    payload_type: Any = inspect.Signature.empty,
) -> WorkerCallable:
    subscriptions.append(
        _Subscription(
            func=func,
            topic_filter=topic_filter,
            topic_desc=topic_desc,
            invocation=_build_invocation_plan(func, payload_type=payload_type),
        )
    )
    return func


def _build_subscribe_decorator(
    subscriptions: list[_Subscription],
    topic: str | tuple[str, Callable[[str | None], bool]] | None,
    payload_type: Any = inspect.Signature.empty,
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
            payload_type=payload_type,
        )

    return decorator


def _subscription_handler_name(func: WorkerCallable) -> str:
    module = getattr(func, "__module__", "")
    qualname = getattr(func, "__qualname__", getattr(func, "__name__", "worker"))
    return f"{module}:{qualname}" if module else str(qualname)


def _serialize_subscriptions(subscriptions: Iterable[_Subscription]) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    for sub in subscriptions:
        if sub.topic_desc is None:
            continue
        entries.append(
            {
                "topic": sub.topic_desc,
                "handler": _subscription_handler_name(sub.func),
            }
        )
    return entries


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


def get_vercel_queue_subscriptions() -> list[dict[str, str]]:
    """Return registered queue subscriptions for build-time service detection."""

    return _serialize_subscriptions(_subscriptions)


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


async def _invoke_subscriptions_async(
    message: Any,
    metadata: MessageMetadata,
    subscriptions: Iterable[_Subscription] = _subscriptions,
) -> int | None:
    """
    Async variant of _invoke_subscriptions for in-process async clients.
    """
    topic = metadata.get("topic")
    timeout_seconds: int | None = None

    for sub in _select_subscriptions(topic, subscriptions):
        try:
            result = _call_subscription(sub, message, metadata)
            if asyncio.iscoroutine(result) or isinstance(result, asyncio.Future):
                result = await result
        except Ack:
            return None
        except RetryAfter as directive:
            return directive.timeout_seconds
        except Exception:
            # Let the caller surface the subscription failure.
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
    request_config: callback.QueueRequestConfig | None,
) -> None:
    def delete() -> None:
        if request_config is None:
            callback.delete_message(
                queue_name,
                consumer_group,
                message_id,
                receipt_handle,
            )
            return
        callback.delete_message(
            queue_name,
            consumer_group,
            message_id,
            receipt_handle,
            request_config=request_config,
        )

    if extender is not None:
        extender.finalize(delete)
    else:
        delete()


def _change_visibility_sync(
    queue_name: str,
    consumer_group: str,
    message_id: str,
    receipt_handle: str,
    timeout_seconds: int,
    extender: callback.VisibilityExtender | None,
    request_config: callback.QueueRequestConfig | None,
) -> None:
    def change() -> None:
        if request_config is None:
            callback.change_visibility(
                queue_name,
                consumer_group,
                message_id,
                receipt_handle,
                timeout_seconds,
            )
            return
        callback.change_visibility(
            queue_name,
            consumer_group,
            message_id,
            receipt_handle,
            timeout_seconds,
            request_config=request_config,
        )

    if extender is not None:
        extender.finalize(change)
    else:
        change()


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
    _invoke_subscriptions(payload, metadata, subscriptions)

    return {"messageId": metadata["messageId"]}


async def _send_in_process_async(
    queue_name: str,
    payload: Any,
    subscriptions: list[_Subscription] = _subscriptions,
) -> SendMessageResult:
    metadata = _prepare_in_process_delivery(queue_name, subscriptions)
    await _invoke_subscriptions_async(payload, metadata, subscriptions)
    return {"messageId": metadata["messageId"]}


def _handle_queue_callback(
    raw_body: bytes,
    environ: dict[str, Any] | None = None,
    subscriptions: list[_Subscription] = _subscriptions,
    request_config: callback.QueueRequestConfig | None = None,
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

        if is_v2beta:
            v2 = callback.parse_v2beta_callback(raw_body, environ or {})
            queue_name = v2["queueName"]
            consumer_group = v2["consumerGroup"]
            message_id = v2["messageId"]
            receipt_handle = v2["receiptHandle"]
            delivery_count = v2["deliveryCount"]
            created_at = v2["createdAt"]
            payload: Any = v2["payload"]
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
                request_config=request_config,
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
                timeout=request_config.timeout if request_config is not None else 10.0,
                request_config=request_config,
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
                _change_visibility_sync(
                    queue_name,
                    consumer_group,
                    message_id,
                    receipt_handle,
                    int(timeout_seconds),
                    extender,
                    request_config,
                )
            else:
                _delete_message_sync(
                    queue_name,
                    consumer_group,
                    message_id,
                    receipt_handle,
                    extender,
                    request_config,
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


def _build_asgi_app_for_subscriptions(
    subscriptions: list[_Subscription],
    request_config: callback.QueueRequestConfig | None = None,
) -> ASGI:
    return build_asgi_app(
        lambda raw_body, environ: _handle_queue_callback(
            raw_body,
            environ,
            subscriptions,
            request_config,
        )
    )


def get_wsgi_app() -> WSGI:
    """Return a WSGI app that executes subscribed workers from Vercel Queue callbacks."""
    return build_wsgi_app(handle_queue_callback)


def get_asgi_app() -> ASGI:
    """Return an ASGI app that executes subscribed workers from Vercel Queue callbacks."""
    return _build_asgi_app_for_subscriptions(_subscriptions)


def get_queue_base_url() -> str:
    """
    Return the base URL for the Vercel Queue Service API.

    Mirrors the JS client behaviour:
      - VERCEL_QUEUE_BASE_URL environment variable
      - if VERCEL_REGION environment variable is set then routes to
        region specific endpoint, e.g. "https://iad1.vercel-queue.com"
      - otherwise to "https://vercel-queue.com"
    """
    base_url = os.environ.get("VERCEL_QUEUE_BASE_URL")
    if base_url:
        return base_url.rstrip("/")

    region = os.environ.get("VERCEL_REGION")
    if region:
        return f"https://{region}.vercel-queue.com"
    else:
        return "https://vercel-queue.com"


def get_queue_base_path() -> str:
    """
    Return the base path for the queue V3 API endpoints.

    Mirrors the JS client behaviour:
      - VERCEL_QUEUE_BASE_PATH environment variable
      - default to "/api/v3/topic"
    """
    base_path = os.environ.get("VERCEL_QUEUE_BASE_PATH", "/api/v3/topic")
    if not base_path.startswith("/"):
        base_path = "/" + base_path
    return base_path


def get_queue_token(explicit_token: str | None = None) -> str:
    """
    Resolve the token used to authenticate with the queue service (synchronously).

    Resolution order:
      1. An explicit ``token=...`` argument.
      2. The ``VERCEL_QUEUE_TOKEN`` environment variable.
      3. The Vercel OIDC token from ``vercel.oidc.get_vercel_oidc_token``.

    This helper is used by the synchronous ``send`` function.
    """
    if explicit_token:
        return explicit_token

    env_token = os.environ.get("VERCEL_QUEUE_TOKEN")
    if env_token:
        return env_token

    # Fall back to Vercel OIDC token when running inside a Vercel environment.
    # We use asyncio.run() in contexts without a running event loop. If an event
    # loop is already running, we silently skip this step and fall through to
    # the error below, encouraging callers to either pass an explicit token or
    # use the async send_async() helper instead.
    token: str | None = None
    from vercel.oidc import get_vercel_oidc_token

    token = get_vercel_oidc_token()

    if token:
        return token

    msg = (
        "Failed to resolve queue token. Provide 'token' explicitly when calling send(), "
        "set the VERCEL_QUEUE_TOKEN environment variable, "
        "or ensure a Vercel OIDC token is available in this environment."
    )
    raise TokenResolutionError(msg)


async def get_queue_token_async(explicit_token: str | None = None) -> str:
    """
    Resolve the token used to authenticate with the queue service (asynchronously).

    Resolution order:
      1. An explicit ``token=...`` argument.
      2. The ``VERCEL_QUEUE_TOKEN`` environment variable.
      3. The Vercel OIDC token from ``vercel.oidc.aio.get_vercel_oidc_token``.
    """
    if explicit_token:
        return explicit_token

    env_token = os.environ.get("VERCEL_QUEUE_TOKEN")
    if env_token:
        return env_token

    # Fall back to Vercel OIDC token when running inside a Vercel environment.
    from vercel.oidc.aio import get_vercel_oidc_token as get_vercel_oidc_token_async

    token = await get_vercel_oidc_token_async()
    if token:
        return token

    msg = (
        "Failed to resolve queue token. Provide 'token' explicitly when calling send_async(), "
        "set the VERCEL_QUEUE_TOKEN environment variable, "
        "or ensure a Vercel OIDC token is available in this environment."
    )
    raise TokenResolutionError(msg)


class _BaseQueueClient:
    def __init__(
        self,
        *,
        region: str | None = None,
        token: str | None = None,
        base_url: str | None = None,
        base_path: str | None = None,
        deployment_id: _DeploymentIdOption = _DEPLOYMENT_ID_UNSET,
        headers: dict[str, str] | None = None,
        content_type: str = "application/json",
        timeout: float | None = 10.0,
        json_encoder: type[json.JSONEncoder] | None = None,
    ) -> None:
        self.region: str | None = region
        self.token: str | None = token
        self.base_url: str | None = base_url
        self.base_path: str | None = base_path
        self.deployment_id: _DeploymentIdOption = deployment_id
        self.headers: dict[str, str] | None = dict(headers) if headers is not None else None
        self.content_type: str = content_type
        self.timeout: float | None = timeout
        self.json_encoder: type[json.JSONEncoder] | None = json_encoder
        self._subscriptions: list[_Subscription] = []

    def _resolved_base_url(self) -> str | None:
        if self.base_url is not None:
            return self.base_url
        # In `vercel dev`, this env var points at the local queue proxy. Let it win
        # over region so client instances still dispatch to local worker services.
        if os.environ.get("VERCEL_QUEUE_BASE_URL"):
            return None
        if self.region is not None:
            return f"https://{self.region}.vercel-queue.com"
        return None

    def _merged_headers(self, headers: dict[str, str] | None) -> dict[str, str] | None:
        if self.headers is None:
            return headers
        if headers is None:
            return dict(self.headers)
        return self.headers | headers

    def _request_config(self) -> callback.QueueRequestConfig:
        if self.deployment_id is not _DEPLOYMENT_ID_UNSET:
            return callback.QueueRequestConfig(
                token=self.token,
                base_url=self._resolved_base_url(),
                base_path=self.base_path,
                deployment_id=cast(str | None, self.deployment_id),
                headers=self.headers,
                timeout=self.timeout,
            )
        return callback.QueueRequestConfig(
            token=self.token,
            base_url=self._resolved_base_url(),
            base_path=self.base_path,
            headers=self.headers,
            timeout=self.timeout,
        )

    @overload
    def subscribe(self, _func: WorkerCallable) -> WorkerCallable: ...

    @overload
    def subscribe(
        self,
        *,
        topic: str | tuple[str, Callable[[str | None], bool]] | None = None,
    ) -> Callable[[WorkerCallable], WorkerCallable]: ...

    def subscribe(
        self,
        _func: WorkerCallable | None = None,
        *,
        topic: str | tuple[str, Callable[[str | None], bool]] | None = None,
    ) -> Callable[[WorkerCallable], WorkerCallable] | WorkerCallable:
        """Register a queue worker function with this client's registry."""

        decorator = _build_subscribe_decorator(self._subscriptions, topic)
        if _func is not None:
            return decorator(_func)
        return decorator

    def has_subscriptions(self) -> bool:
        """Return True if this client has registered queue workers."""

        return bool(self._subscriptions)

    def get_vercel_queue_subscriptions(self) -> list[dict[str, str]]:
        """Return this client's subscriptions for build-time service detection."""

        return _serialize_subscriptions(self._subscriptions)

    def handle_queue_callback(
        self,
        raw_body: bytes,
        environ: dict[str, Any] | None = None,
    ) -> tuple[int, list[tuple[str, str]], bytes]:
        """Handle a queue callback using this client's subscription registry."""

        return _handle_queue_callback(
            raw_body,
            environ,
            self._subscriptions,
            self._request_config(),
        )

    def get_wsgi_app(self) -> WSGI:
        """Return a WSGI app that executes this client's subscribed workers."""

        return build_wsgi_app(self.handle_queue_callback)

    def get_asgi_app(self) -> ASGI:
        """Return an ASGI app that executes this client's subscribed workers."""

        return _build_asgi_app_for_subscriptions(
            self._subscriptions,
            self._request_config(),
        )

    def topic_subscribe_decorator(
        self,
        topic: str,
        *,
        payload_type: Any = inspect.Signature.empty,
    ) -> Callable[[WorkerCallable], WorkerCallable]:
        return _build_subscribe_decorator(
            self._subscriptions,
            topic,
            payload_type=payload_type,
        )


def get_asgi_app_for_client(client: _BaseQueueClient) -> ASGI:
    return _build_asgi_app_for_subscriptions(
        client._subscriptions,
        client._request_config(),
    )


class QueueClient(_BaseQueueClient):
    """Configured synchronous client for publishing Vercel Queue messages."""

    @overload
    def topic(self, name: str) -> Topic[Any]: ...

    @overload
    def topic[PayloadT](self, name: str, *, payload_type: type[PayloadT]) -> Topic[PayloadT]: ...

    @overload
    def topic(self, name: str, *, payload_type: Any) -> Topic[Any]: ...

    def topic(
        self,
        name: str,
        *,
        payload_type: Any = inspect.Signature.empty,
    ) -> Topic[Any]:
        """Return a typed handle for a queue topic."""

        return Topic(self, name, payload_type=payload_type)

    def send(
        self,
        queue_name: str,
        payload: Any,
        *,
        idempotency_key: str | None = None,
        retention_seconds: int | None = None,
        delay_seconds: int | None = None,
        deployment_id: _DeploymentIdOption = _DEPLOYMENT_ID_UNSET,
        headers: dict[str, str] | None = None,
    ) -> SendMessageResult:
        if _in_process_mode_enabled():
            return _send_in_process(queue_name, payload, self._subscriptions)

        effective_deployment_id = (
            self.deployment_id if deployment_id is _DEPLOYMENT_ID_UNSET else deployment_id
        )
        return send(
            queue_name,
            payload,
            idempotency_key=idempotency_key,
            retention_seconds=retention_seconds,
            delay_seconds=delay_seconds,
            deployment_id=effective_deployment_id,
            token=self.token,
            base_url=self._resolved_base_url(),
            base_path=self.base_path,
            content_type=self.content_type,
            timeout=self.timeout,
            headers=self._merged_headers(headers),
            json_encoder=self.json_encoder,
        )


class AsyncQueueClient(_BaseQueueClient):
    """Configured asynchronous client for publishing Vercel Queue messages."""

    @overload
    def topic(self, name: str) -> AsyncTopic[Any]: ...

    @overload
    def topic[PayloadT](
        self, name: str, *, payload_type: type[PayloadT]
    ) -> AsyncTopic[PayloadT]: ...

    @overload
    def topic(self, name: str, *, payload_type: Any) -> AsyncTopic[Any]: ...

    def topic(
        self,
        name: str,
        *,
        payload_type: Any = inspect.Signature.empty,
    ) -> AsyncTopic[Any]:
        """Return a typed async handle for a queue topic."""

        return AsyncTopic(self, name, payload_type=payload_type)

    async def send(
        self,
        queue_name: str,
        payload: Any,
        *,
        idempotency_key: str | None = None,
        retention_seconds: int | None = None,
        delay_seconds: int | None = None,
        deployment_id: _DeploymentIdOption = _DEPLOYMENT_ID_UNSET,
        headers: dict[str, str] | None = None,
    ) -> SendMessageResult:
        if _in_process_mode_enabled():
            return await _send_in_process_async(
                queue_name,
                payload,
                self._subscriptions,
            )

        effective_deployment_id = (
            self.deployment_id if deployment_id is _DEPLOYMENT_ID_UNSET else deployment_id
        )
        return await send_async(
            queue_name,
            payload,
            idempotency_key=idempotency_key,
            retention_seconds=retention_seconds,
            delay_seconds=delay_seconds,
            deployment_id=effective_deployment_id,
            token=self.token,
            base_url=self._resolved_base_url(),
            base_path=self.base_path,
            content_type=self.content_type,
            timeout=self.timeout,
            headers=self._merged_headers(headers),
            json_encoder=self.json_encoder,
        )


class _BaseTopic[PayloadT, ClientT: _BaseQueueClient]:
    def __init__(
        self,
        client: ClientT,
        name: str,
        *,
        payload_type: Any = inspect.Signature.empty,
    ) -> None:
        self.client: ClientT = client
        self.name: str = name
        self.payload_type: Any = payload_type
        self._payload_adapter: TypeAdapter[Any] | None = (
            None if _is_untyped_payload_annotation(payload_type) else TypeAdapter(payload_type)
        )

    def _prepare_payload(self, payload: PayloadT, *, json_mode: bool) -> Any:
        if self._payload_adapter is None:
            return payload
        validated = self._payload_adapter.validate_python(payload)
        if not json_mode:
            return validated
        return self._payload_adapter.dump_python(validated, mode="json")

    @overload
    def subscribe(self, _func: WorkerCallable) -> WorkerCallable: ...

    @overload
    def subscribe(self) -> Callable[[WorkerCallable], WorkerCallable]: ...

    def subscribe(
        self,
        _func: WorkerCallable | None = None,
    ) -> Callable[[WorkerCallable], WorkerCallable] | WorkerCallable:
        """Register a queue worker for this topic."""

        decorator = self.client.topic_subscribe_decorator(self.name, payload_type=self.payload_type)
        if _func is not None:
            return decorator(_func)
        return decorator


class Topic[PayloadT](_BaseTopic[PayloadT, QueueClient]):
    """Typed queue topic bound to a synchronous QueueClient."""

    def __init__(
        self,
        client: QueueClient,
        name: str,
        *,
        payload_type: Any = inspect.Signature.empty,
    ) -> None:
        super().__init__(client, name, payload_type=payload_type)

    def send(
        self,
        payload: PayloadT,
        *,
        idempotency_key: str | None = None,
        retention_seconds: int | None = None,
        delay_seconds: int | None = None,
        deployment_id: _DeploymentIdOption = _DEPLOYMENT_ID_UNSET,
        headers: dict[str, str] | None = None,
    ) -> SendMessageResult:
        return self.client.send(
            self.name,
            self._prepare_payload(
                payload,
                json_mode=self.client.content_type == "application/json",
            ),
            idempotency_key=idempotency_key,
            retention_seconds=retention_seconds,
            delay_seconds=delay_seconds,
            deployment_id=deployment_id,
            headers=headers,
        )


class AsyncTopic[PayloadT](_BaseTopic[PayloadT, AsyncQueueClient]):
    """Typed queue topic bound to an asynchronous AsyncQueueClient."""

    def __init__(
        self,
        client: AsyncQueueClient,
        name: str,
        *,
        payload_type: Any = inspect.Signature.empty,
    ) -> None:
        super().__init__(client, name, payload_type=payload_type)

    async def send(
        self,
        payload: PayloadT,
        *,
        idempotency_key: str | None = None,
        retention_seconds: int | None = None,
        delay_seconds: int | None = None,
        deployment_id: _DeploymentIdOption = _DEPLOYMENT_ID_UNSET,
        headers: dict[str, str] | None = None,
    ) -> SendMessageResult:
        return await self.client.send(
            self.name,
            self._prepare_payload(
                payload,
                json_mode=self.client.content_type == "application/json",
            ),
            idempotency_key=idempotency_key,
            retention_seconds=retention_seconds,
            delay_seconds=delay_seconds,
            deployment_id=deployment_id,
            headers=headers,
        )


def send(
    queue_name: str,
    payload: Any,
    *,
    idempotency_key: str | None = None,
    retention_seconds: int | None = None,
    delay_seconds: int | None = None,
    deployment_id: _DeploymentIdOption = _DEPLOYMENT_ID_UNSET,
    token: str | None = None,
    base_url: str | None = None,
    base_path: str | None = None,
    content_type: str = "application/json",
    timeout: float | None = 10.0,
    headers: dict[str, str] | None = None,
    json_encoder: type[json.JSONEncoder] | None = None,
) -> SendMessageResult:
    """
    Send a message to a Vercel Queue (synchronous).

    It resolves
    authentication in this order:
      1) explicit ``token=...``
      2) ``VERCEL_QUEUE_TOKEN`` environment variable
      3) Vercel OIDC token (when running inside Vercel)

    For async applications, prefer :func:`send_async`.

    Args:
        queue_name: Name of the target queue (equivalent to ``queueName``).
        payload: Message payload. For the default JSON content type this must be JSON-serialisable.
        idempotency_key: Optional key to deduplicate submissions (``Vqs-Idempotency-Key`` header).
        retention_seconds: Optional message retention time in seconds (``Vqs-Retention-Seconds``).
        delay_seconds: Optional delay before the message becomes visible (``Vqs-Delay-Seconds``).
        deployment_id: Deployment pinning mode. Omit to auto-detect ``VERCEL_DEPLOYMENT_ID``,
            pass ``None`` to explicitly send without a deployment ID, or pass a string to pin
            to a specific deployment.
        token: Authentication token. If omitted, falls back to ``VERCEL_QUEUE_TOKEN`` env var.
        base_url: Override base URL for the queue API. Defaults to ``VERCEL_QUEUE_BASE_URL`` or
            ``https://vercel-queue.com``.
        base_path: Override base path for the messages endpoint. Defaults to
            ``VERCEL_QUEUE_BASE_PATH`` or ``/api/v3/topic``.
        content_type: MIME type of the payload. Defaults to ``application/json``.
        timeout: Optional request timeout in seconds.
        headers: Additional headers to include in all requests.

    Returns:
        A dict containing the generated ``messageId``.
    """
    # By default we always talk to the Queue Service API (even in local development).
    #
    # For an explicit in-process dev shortcut (no persistence / retries), set:
    #   VERCEL_WORKERS_IN_PROCESS=1
    if _in_process_mode_enabled():
        return _send_in_process(queue_name, payload)

    resolved_base_url = (base_url or get_queue_base_url()).rstrip("/")
    resolved_base_path = base_path or get_queue_base_path()

    auth_token = get_queue_token(token)

    headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": content_type,
    } | (headers or {})

    resolved_deployment_id = _resolve_deployment_id(deployment_id)
    if resolved_deployment_id:
        headers["Vqs-Deployment-Id"] = resolved_deployment_id

    if idempotency_key:
        headers["Vqs-Idempotency-Key"] = idempotency_key

    if retention_seconds is not None:
        headers["Vqs-Retention-Seconds"] = str(retention_seconds)

    if delay_seconds is not None:
        headers["Vqs-Delay-Seconds"] = str(delay_seconds)

    # Basic payload handling: default to JSON, but allow callers to provide their own
    # serialisation if they change the content type.
    if content_type == "application/json":
        body: bytes = json.dumps(payload, cls=json_encoder or WorkerJSONEncoder).encode("utf-8")
    elif isinstance(payload, (bytes, bytearray)):
        body = bytes(payload)
    else:
        raise TypeError(
            "Non-JSON content_type requires 'payload' to be bytes or bytearray; "
            "for structured data use the default JSON content type.",
        )

    url = f"{resolved_base_url}{resolved_base_path}/{quote(queue_name, safe='')}"

    with httpx.Client(timeout=timeout) as client:
        response = client.post(url, content=body, headers=headers)

    # Map common error codes to Python exceptions similar to the TS client.
    if response.status_code == 400:
        raise BadRequestError(response.text or "Invalid parameters")
    if response.status_code == 401:
        raise UnauthorizedError()
    if response.status_code == 403:
        raise ForbiddenError()
    if response.status_code == 409:
        raise DuplicateIdempotencyKeyError("Duplicate idempotency key detected")
    if response.status_code >= 500:
        msg = response.text or f"Server error: {response.status_code} {response.reason_phrase}"
        raise InternalServerError(msg)

    if response.status_code not in {201, 202}:
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:  # pragma: no cover - defensive
            raise RuntimeError(
                f"Failed to send message: {exc.response.status_code} {exc.response.reason_phrase}",
            ) from exc

    if response.status_code == 202:
        warnings.warn(
            "message was accepted but delivery is deferred (202 Accepted). "
            "This usually means the queue is configured with a delay or the "
            "message is pending consumer discovery.",
            stacklevel=2,
        )
        return {"messageId": None}

    data = response.json()
    if not isinstance(data, dict) or "messageId" not in data:
        raise RuntimeError("Queue API returned an unexpected response: missing 'messageId'")

    return {"messageId": str(data["messageId"])}


async def send_async(
    queue_name: str,
    payload: Any,
    *,
    idempotency_key: str | None = None,
    retention_seconds: int | None = None,
    delay_seconds: int | None = None,
    deployment_id: _DeploymentIdOption = _DEPLOYMENT_ID_UNSET,
    token: str | None = None,
    base_url: str | None = None,
    base_path: str | None = None,
    content_type: str = "application/json",
    timeout: float | None = 10.0,
    headers: dict[str, str] | None = None,
    json_encoder: type[json.JSONEncoder] | None = None,
) -> SendMessageResult:
    """
    Asynchronous variant of :func:`send` that additionally supports resolving
    tokens via the Vercel OIDC helper when running inside Vercel.

    Args:
        queue_name: Name of the target queue (equivalent to ``queueName``).
        payload: Message payload. For the default JSON content type this must be JSON-serialisable.
        idempotency_key: Optional key to deduplicate submissions (``Vqs-Idempotency-Key`` header).
        retention_seconds: Optional message retention time in seconds (``Vqs-Retention-Seconds``).
        delay_seconds: Optional delay before the message becomes visible (``Vqs-Delay-Seconds``).
        deployment_id: Deployment pinning mode. Omit to auto-detect ``VERCEL_DEPLOYMENT_ID``,
            pass ``None`` to explicitly send without a deployment ID, or pass a string to pin
            to a specific deployment.
        token: Authentication token. If omitted, falls back to ``VERCEL_QUEUE_TOKEN`` env var.
        base_url: Override base URL for the queue API. Defaults to ``VERCEL_QUEUE_BASE_URL`` or
            ``https://vercel-queue.com``.
        base_path: Override base path for the messages endpoint. Defaults to
            ``VERCEL_QUEUE_BASE_PATH`` or ``/api/v3/topic``.
        content_type: MIME type of the payload. Defaults to ``application/json``.
        timeout: Optional request timeout in seconds.
        headers: Additional headers to include in all requests.

    Returns:
        A dict containing the generated ``messageId``.
    """
    resolved_base_url = (base_url or get_queue_base_url()).rstrip("/")
    resolved_base_path = base_path or get_queue_base_path()

    auth_token = await get_queue_token_async(token)

    headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": content_type,
    } | (headers or {})

    resolved_deployment_id = _resolve_deployment_id(deployment_id)
    if resolved_deployment_id:
        headers["Vqs-Deployment-Id"] = resolved_deployment_id

    if idempotency_key:
        headers["Vqs-Idempotency-Key"] = idempotency_key

    if retention_seconds is not None:
        headers["Vqs-Retention-Seconds"] = str(retention_seconds)

    if delay_seconds is not None:
        headers["Vqs-Delay-Seconds"] = str(delay_seconds)

    # Basic payload handling: default to JSON, but allow callers to provide their own
    # serialisation if they change the content type.
    if content_type == "application/json":
        body: bytes = json.dumps(payload, cls=json_encoder or WorkerJSONEncoder).encode("utf-8")
    elif isinstance(payload, (bytes, bytearray)):
        body = bytes(payload)
    else:
        raise TypeError(
            "Non-JSON content_type requires 'payload' to be bytes or bytearray; "
            "for structured data use the default JSON content type.",
        )

    url = f"{resolved_base_url}{resolved_base_path}/{quote(queue_name, safe='')}"

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, content=body, headers=headers)

    # Map common error codes to Python exceptions similar to the TS client.
    if response.status_code == 400:
        raise BadRequestError(response.text or "Invalid parameters")
    if response.status_code == 401:
        raise UnauthorizedError()
    if response.status_code == 403:
        raise ForbiddenError()
    if response.status_code == 409:
        raise DuplicateIdempotencyKeyError("Duplicate idempotency key detected")
    if response.status_code >= 500:
        msg = response.text or f"Server error: {response.status_code} {response.reason_phrase}"
        raise InternalServerError(msg)

    if response.status_code not in {201, 202}:
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:  # pragma: no cover - defensive
            raise RuntimeError(
                f"Failed to send message: {exc.response.status_code} {exc.response.reason_phrase}",
            ) from exc

    if response.status_code == 202:
        warnings.warn(
            "message was accepted but delivery is deferred (202 Accepted). "
            "This usually means the queue is configured with a delay or the "
            "message is pending consumer discovery.",
            stacklevel=2,
        )
        return {"messageId": None}

    data = response.json()
    if not isinstance(data, dict) or "messageId" not in data:
        raise RuntimeError("Queue API returned an unexpected response: missing 'messageId'")

    return {"messageId": str(data["messageId"])}
