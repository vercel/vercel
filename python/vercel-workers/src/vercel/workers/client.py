from __future__ import annotations

import asyncio
import json
import os
import warnings
from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from functools import wraps
from typing import Any, Protocol, TypedDict, overload
from urllib.parse import quote
from uuid import UUID, uuid4

import httpx

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
    "WorkerJSONEncoder",
    "WorkerTimeoutResult",
    "subscribe",
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


class WorkerTimeoutResult(TypedDict):
    """Result that instructs the queue to retry the message later."""

    timeoutSeconds: int


class WorkerCallable(Protocol):
    def __call__(self, message: Any, metadata: MessageMetadata) -> Any | Awaitable[Any]: ...


class SendMessageResult(TypedDict):
    """Result of sending a message to the queue.

    ``messageId`` is ``None`` when the server returns 202 (deferred delivery).
    """

    messageId: str | None


@dataclass
class _Subscription:
    func: WorkerCallable
    topic_filter: Callable[[str | None], bool] | None = None
    topic_desc: str | None = None
    consumer: str | None = None

    def matches(
        self, topic: str | None, consumer: str | None = None, *, ignore_consumer: bool = False
    ) -> bool:
        if self.topic_filter is not None:
            if not self.topic_filter(topic):
                return False
        if not ignore_consumer and self.consumer is not None:
            if self.consumer != consumer:
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
    """
    Register a queue worker function.

    Usage:

        @subscribe
        def worker(message, metadata): ...

        @subscribe(topic="events", consumer="billing")
        def billing_worker(message, metadata): ...

        @subscribe(topic=("user-*", lambda t: t.startswith("user-")))
        def user_worker(message, metadata): ...
    """

    topic_filter: Callable[[str | None], bool] | None
    if isinstance(topic, str):

        def topic_filter(t: str | None) -> bool:
            return t == topic

        topic_desc = topic
    elif isinstance(topic, tuple):
        topic_desc, topic_filter = topic
    else:
        topic_filter = None
        topic_desc = None

    def decorator(func: WorkerCallable) -> WorkerCallable:
        _subscriptions.append(
            _Subscription(
                func=func, topic_filter=topic_filter, topic_desc=topic_desc, consumer=consumer
            )
        )

        @wraps(func)
        def wrapper(message: Any, metadata: MessageMetadata) -> Any:
            return func(message, metadata)

        return wrapper  # type: ignore[return-value]

    if _func is not None:
        # Used as @subscribe without arguments
        return decorator(_func)

    # Used as @subscribe(...)
    return decorator


def has_subscriptions() -> bool:
    """Return True if any worker functions have been registered via @subscribe."""
    return bool(_subscriptions)


def _select_subscriptions(
    topic: str | None,
    consumer: str | None,
    *,
    ignore_consumer: bool = False,
) -> Iterable[_Subscription]:
    # Match by topic and consumer (unless consumer is ignored).
    explicit_matches = [
        s for s in _subscriptions if s.matches(topic, consumer, ignore_consumer=ignore_consumer)
    ]
    return explicit_matches


def _invoke_subscriptions(
    message: Any,
    metadata: MessageMetadata,
    *,
    ignore_consumer: bool = False,
) -> int | None:
    """
    Invoke all matching subscriptions and return an optional timeoutSeconds.

    If a worker returns a dict like {"timeoutSeconds": 300} then that value
    will be propagated back to the queue service to delay the next attempt.
    """
    topic = metadata.get("topic")
    consumer = metadata.get("consumer")
    timeout_seconds: int | None = None

    for sub in _select_subscriptions(topic, consumer, ignore_consumer=ignore_consumer):
        try:
            result = sub.func(message, metadata)
            if asyncio.iscoroutine(result) or isinstance(result, asyncio.Future):
                result = asyncio.run(result)  # type: ignore[arg-type]
        except Exception:
            # Let the outer WSGI handler respond with 500.
            raise

        if isinstance(result, dict) and "timeoutSeconds" in result:
            try:
                timeout_seconds = int(result["timeoutSeconds"])
            except (TypeError, ValueError):
                # Ignore invalid timeout values; continue with previous one if any.
                pass

    return timeout_seconds


def _send_in_process(queue_name: str, payload: Any) -> SendMessageResult:
    """
    Development-only, in-process send implementation.

    When ``VERCEL_WORKERS_IN_PROCESS=1``, :func:`send` can short-circuit and invoke
    subscribed workers directly in the current process instead of talking to the
    Queue Service API.

    This mirrors the TypeScript dev experience where callbacks are triggered
    locally, but without any persistence, visibility timeouts, or retries.
    """
    if not _subscriptions:
        raise RuntimeError(
            "No worker subscriptions registered. Import the module containing your "
            "@subscribe handlers before calling send() in in-process dev mode.",
        )

    # In dev mode, surface a clear error when there are worker functions but none of
    # them are subscribed to the requested topic. This helps catch mismatches between
    # the queue name used in send() and the topics configured via @subscribe.
    matching_for_topic = [s for s in _subscriptions if s.matches(queue_name, ignore_consumer=True)]
    if not matching_for_topic:
        available_topics = sorted(
            {s.topic_desc for s in _subscriptions if s.topic_desc is not None},
        )
        raise RuntimeError(
            "No worker subscriptions found for topic "
            f"{queue_name!r} in in-process dev mode. "
            "Known topics: "
            + (", ".join(repr(t) for t in available_topics) or "(none with explicit topics)"),
        )

    message_id = str(uuid4())
    metadata: MessageMetadata = {
        "messageId": message_id,
        "deliveryCount": 1,
        "createdAt": datetime.now(UTC).isoformat(),
        "topic": queue_name,
    }

    # In dev mode we intentionally ignore consumer-group targeting and deliver
    # to all handlers that match the topic (or have no explicit topic), similar
    # to the TypeScript dev.ts behaviour.
    _invoke_subscriptions(payload, metadata, ignore_consumer=True)

    return {"messageId": message_id}


def handle_queue_callback(
    raw_body: bytes,
    environ: dict[str, Any] | None = None,
) -> tuple[int, list[tuple[str, str]], bytes]:
    """
    Core callback handler used by both WSGI/ASGI wrappers.

    Returns: (status_code, headers, body_bytes)
    """

    extender: callback.VisibilityExtender | None = None
    try:
        if not _subscriptions:
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

        # Fail fast if no workers match this topic/consumer.
        if not _select_subscriptions(queue_name, consumer_group):
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
        timeout_seconds = _invoke_subscriptions(payload, metadata)
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


def get_wsgi_app() -> WSGI:
    """Return a WSGI app that executes subscribed workers from Vercel Queue callbacks."""
    return build_wsgi_app(handle_queue_callback)


def get_asgi_app() -> ASGI:
    """Return an ASGI app that executes subscribed workers from Vercel Queue callbacks."""
    return build_asgi_app(handle_queue_callback)


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


def send(
    queue_name: str,
    payload: Any,
    *,
    idempotency_key: str | None = None,
    retention_seconds: int | None = None,
    delay_seconds: int | None = None,
    deployment_id: str | None = None,
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
        deployment_id: Optional deployment identifier (``Vqs-Deployment-Id``).
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
    if os.environ.get("VERCEL_WORKERS_IN_PROCESS") in {"1", "true", "TRUE", "yes", "YES"}:
        return _send_in_process(queue_name, payload)

    resolved_base_url = (base_url or get_queue_base_url()).rstrip("/")
    resolved_base_path = base_path or get_queue_base_path()

    auth_token = get_queue_token(token)

    headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": content_type,
    } | (headers or {})

    deployment_id = deployment_id or os.environ.get("VERCEL_DEPLOYMENT_ID")
    if deployment_id:
        headers["Vqs-Deployment-Id"] = deployment_id

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
    deployment_id: str | None = None,
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
        deployment_id: Optional deployment identifier (``Vqs-Deployment-Id``).
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

    deployment_id = deployment_id or os.environ.get("VERCEL_DEPLOYMENT_ID")
    if deployment_id:
        headers["Vqs-Deployment-Id"] = deployment_id

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
