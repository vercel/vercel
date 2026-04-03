from __future__ import annotations

import asyncio
import json
import os
from collections.abc import Awaitable, Callable, Coroutine, Iterable, Mapping
from dataclasses import dataclass, replace
from datetime import date, datetime
from decimal import Decimal
from email.parser import BytesParser
from email.policy import default as _email_default_policy
from functools import wraps
from typing import Any, Protocol, TypedDict, cast, overload
from urllib.parse import quote
from uuid import UUID

import httpx

from .asgi import ASGI, build_asgi_app
from .exceptions import (
    BadRequestError,
    DuplicateIdempotencyKeyError,
    ForbiddenError,
    InternalServerError,
    InvalidLimitError,
    MessageAlreadyProcessedError,
    MessageCorruptedError,
    MessageNotAvailableError,
    MessageNotFoundError,
    ThrottledError,
    TokenResolutionError,
    UnauthorizedError,
)
from .wsgi import WSGI, build_wsgi_app, json_response

__all__ = [
    "AsyncQueueClient",
    "MessageMetadata",
    "QueueClient",
    "ReceivedMessage",
    "SendMessageResult",
    "WorkerJSONEncoder",
    "WorkerTimeoutResult",
    "get_asgi_app",
    "get_wsgi_app",
    "has_subscriptions",
    "send",
    "send_async",
    "subscribe",
]

BASE_PATH = "/api/v3/topic"
DEFAULT_REGION = "iad1"


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


class MessageMetadata(TypedDict):
    """Metadata describing a queue message delivery."""

    messageId: str
    deliveryCount: int
    createdAt: str
    expiresAt: str | None
    topicName: str
    consumerGroup: str
    region: str


class WorkerTimeoutResult(TypedDict):
    """Result that instructs the queue to retry the message later."""

    timeoutSeconds: int


class WorkerCallable(Protocol):
    def __call__(self, message: Any, metadata: MessageMetadata) -> Any | Awaitable[Any]: ...


class SendMessageResult(TypedDict):
    """Result of successfully sending a message to the queue."""

    messageId: str | None


class ReceivedMessage(TypedDict):
    messageId: str
    deliveryCount: int
    createdAt: str
    expiresAt: str | None
    receiptHandle: str
    contentType: str
    payload: Any


BaseUrlResolver = Callable[[str], str]


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


@dataclass(frozen=True)
class _ClientConfig:
    region: str
    token: str | None = None
    base_url: str | None = None
    resolve_base_url: BaseUrlResolver | None = None
    deployment_id: str | None = None
    timeout: float | None = 10.0
    headers: dict[str, str] | None = None
    json_encoder: type[json.JSONEncoder] | None = None


_subscriptions: list[_Subscription] = []


def _resolve_region(region: str | None = None) -> str:
    return region or os.environ.get("VERCEL_REGION") or DEFAULT_REGION


def get_queue_base_url(region: str | None = None) -> str:
    explicit = os.environ.get("VERCEL_QUEUE_BASE_URL")
    if explicit:
        return explicit.rstrip("/")
    return f"https://{_resolve_region(region)}.vercel-queue.com"


def _resolve_base_url(config: _ClientConfig) -> str:
    if config.base_url:
        return config.base_url.rstrip("/")
    if config.resolve_base_url is not None:
        return config.resolve_base_url(config.region).rstrip("/")
    return get_queue_base_url(config.region)


def _compose_base_url(
    base_url: str | None,
    base_path: str | None,
    *,
    region: str | None = None,
) -> str | None:
    if not base_path:
        return base_url

    prefix = base_path.strip()
    for suffix in ("/api/v2/messages", "/api/v3/messages", "/api/v3/topic"):
        if prefix.endswith(suffix):
            prefix = prefix[: -len(suffix)]
            break
    prefix = prefix.rstrip("/")
    if not prefix:
        return base_url

    root = (base_url or get_queue_base_url(region)).rstrip("/")
    normalized_prefix = prefix if prefix.startswith("/") else f"/{prefix}"
    return f"{root}{normalized_prefix}"


def _build_url(base_url: str, queue_name: str, *path_segments: str) -> str:
    encoded_queue = quote(queue_name, safe="")
    encoded_segments = "/".join(quote(segment, safe="") for segment in path_segments)
    suffix = f"/{encoded_segments}" if encoded_segments else ""
    return f"{base_url.rstrip('/')}{BASE_PATH}/{encoded_queue}{suffix}"


def _deployment_id(config: _ClientConfig) -> str | None:
    return config.deployment_id or os.environ.get("VERCEL_DEPLOYMENT_ID")


def _apply_passthrough_headers(
    target: dict[str, str],
    extra_headers: Mapping[str, str] | None,
) -> None:
    if not extra_headers:
        return
    for name, value in extra_headers.items():
        lower = str(name).lower()
        if lower in {"authorization", "content-type"} or lower.startswith("vqs-"):
            continue
        target[str(name)] = str(value)


def _serialize_payload(
    payload: Any,
    *,
    content_type: str,
    json_encoder: type[json.JSONEncoder] | None,
) -> bytes:
    if content_type == "application/json":
        return json.dumps(payload, cls=json_encoder or WorkerJSONEncoder).encode("utf-8")
    if isinstance(payload, (bytes, bytearray)):
        return bytes(payload)
    raise TypeError(
        "Non-JSON content_type requires 'payload' to be bytes or bytearray; "
        "for structured data use the default JSON content type.",
    )


def _parse_retry_after(response: httpx.Response) -> int | None:
    value = response.headers.get("Retry-After")
    if value is None:
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def _raise_common_http_error(
    response: httpx.Response,
    *,
    operation: str,
    bad_request_default: str = "Invalid parameters",
) -> None:
    error_text = response.text
    if response.status_code == 400:
        raise BadRequestError(error_text or bad_request_default)
    if response.status_code == 401:
        raise UnauthorizedError(error_text or None)
    if response.status_code == 403:
        raise ForbiddenError(error_text or None)
    if response.status_code == 429:
        raise ThrottledError(_parse_retry_after(response))
    if response.status_code >= 500:
        raise InternalServerError(error_text or f"Failed to {operation}: {response.reason_phrase}")
    response.raise_for_status()


def _multipart_parts(response: httpx.Response) -> list[tuple[dict[str, str], bytes]]:
    content_type = response.headers.get("Content-Type") or ""
    if "multipart" not in content_type.lower():
        raise RuntimeError(f"Expected multipart/mixed response, got Content-Type={content_type!r}")

    raw = (f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n").encode("latin1")
    raw += response.content
    message = BytesParser(policy=_email_default_policy).parsebytes(raw)  # type: ignore[arg-type]
    if not message.is_multipart():
        raise RuntimeError("Expected multipart response, got non-multipart payload")

    parts: list[tuple[dict[str, str], bytes]] = []
    for part in message.walk():
        if part.is_multipart():
            continue
        headers = dict(part.items())
        payload = part.get_payload(decode=True)
        parts.append((headers, payload if isinstance(payload, bytes) else b""))
    return parts


def _parse_message_part(
    headers: Mapping[str, str],
    payload_bytes: bytes,
    *,
    message_id_hint: str | None = None,
) -> ReceivedMessage | None:
    message_id = headers.get("Vqs-Message-Id")
    created_at = headers.get("Vqs-Timestamp")
    receipt_handle = headers.get("Vqs-Receipt-Handle")
    if not message_id or not created_at or not receipt_handle:
        return None

    delivery_count = 0
    try:
        delivery_count = int(headers.get("Vqs-Delivery-Count") or "0")
    except ValueError:
        delivery_count = 0

    content_type = headers.get("Content-Type") or "application/octet-stream"
    payload: Any = payload_bytes
    if "application/json" in content_type.lower():
        try:
            payload = json.loads(payload_bytes.decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            raise MessageCorruptedError(
                message_id_hint or message_id,
                f"Failed to parse payload as JSON: {exc}",
            ) from exc

    return {
        "messageId": message_id,
        "deliveryCount": delivery_count,
        "createdAt": created_at,
        "expiresAt": headers.get("Vqs-Expires-At"),
        "receiptHandle": receipt_handle,
        "contentType": content_type,
        "payload": payload,
    }


def _parse_send_result(response: httpx.Response) -> SendMessageResult:
    if response.status_code == 202:
        return {"messageId": None}

    data = response.json()
    if not isinstance(data, dict) or "messageId" not in data:
        raise RuntimeError("Queue API returned an unexpected response: missing 'messageId'")
    message_id = data["messageId"]
    return {"messageId": None if message_id is None else str(message_id)}


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
    topic_name = metadata.get("topicName")
    consumer_group = metadata.get("consumerGroup")
    timeout_seconds: int | None = None

    for subscription in _select_subscriptions(
        topic_name,
        consumer_group,
        ignore_consumer=ignore_consumer,
    ):
        result = subscription.func(message, metadata)
        if asyncio.iscoroutine(result):
            result = asyncio.run(cast(Coroutine[Any, Any, Any], result))
        if isinstance(result, dict):
            result_dict = cast(dict[str, Any], result)
            try:
                timeout_value = result_dict.get("timeoutSeconds")
                if timeout_value is not None:
                    timeout_seconds = int(timeout_value)
            except (TypeError, ValueError):
                pass

    return timeout_seconds


class _BaseQueueClient:
    def __init__(
        self,
        *,
        region: str | None = None,
        token: str | None = None,
        base_url: str | None = None,
        resolve_base_url: BaseUrlResolver | None = None,
        deployment_id: str | None = None,
        timeout: float | None = 10.0,
        headers: dict[str, str] | None = None,
        json_encoder: type[json.JSONEncoder] | None = None,
    ) -> None:
        self._config = _ClientConfig(
            region=_resolve_region(region),
            token=token,
            base_url=base_url,
            resolve_base_url=resolve_base_url,
            deployment_id=deployment_id,
            timeout=timeout,
            headers=dict(headers) if headers is not None else None,
            json_encoder=json_encoder,
        )

    @property
    def region(self) -> str:
        return self._config.region

    def _with_region_config(self, region: str) -> _ClientConfig:
        return replace(self._config, region=_resolve_region(region))

    def _base_headers(self) -> dict[str, str]:
        return dict(self._config.headers or {})

    def _base_url(self) -> str:
        return _resolve_base_url(self._config)


class QueueClient(_BaseQueueClient):
    def with_region(self, region: str) -> QueueClient:
        return QueueClient(
            region=region,
            token=self._config.token,
            base_url=self._config.base_url,
            resolve_base_url=self._config.resolve_base_url,
            deployment_id=self._config.deployment_id,
            timeout=self._config.timeout,
            headers=self._config.headers,
            json_encoder=self._config.json_encoder,
        )

    def send(
        self,
        queue_name: str,
        payload: Any,
        *,
        idempotency_key: str | None = None,
        retention_seconds: int | None = None,
        delay_seconds: int | None = None,
        content_type: str = "application/json",
        headers: dict[str, str] | None = None,
    ) -> SendMessageResult:
        request_headers = self._base_headers()
        _apply_passthrough_headers(request_headers, headers)
        request_headers["Authorization"] = f"Bearer {get_queue_token(self._config.token)}"
        request_headers["Content-Type"] = content_type

        deployment_id = _deployment_id(self._config)
        if deployment_id:
            request_headers["Vqs-Deployment-Id"] = deployment_id
        if idempotency_key:
            request_headers["Vqs-Idempotency-Key"] = idempotency_key
        if retention_seconds is not None:
            request_headers["Vqs-Retention-Seconds"] = str(retention_seconds)
        if delay_seconds is not None:
            request_headers["Vqs-Delay-Seconds"] = str(delay_seconds)

        body = _serialize_payload(
            payload,
            content_type=content_type,
            json_encoder=self._config.json_encoder,
        )

        with httpx.Client(timeout=self._config.timeout) as client:
            response = client.post(
                _build_url(self._base_url(), queue_name),
                content=body,
                headers=request_headers,
            )

        if response.status_code == 409:
            raise DuplicateIdempotencyKeyError(
                response.text or "Duplicate idempotency key detected",
            )
        _raise_common_http_error(response, operation="send message")
        return _parse_send_result(response)

    def receive(
        self,
        queue_name: str,
        consumer_group: str,
        *,
        limit: int | None = 1,
        visibility_timeout_seconds: int | None = None,
    ) -> list[ReceivedMessage]:
        if limit is not None and (limit < 1 or limit > 10):
            raise InvalidLimitError(limit)

        request_headers = self._base_headers()
        request_headers["Authorization"] = f"Bearer {get_queue_token(self._config.token)}"
        request_headers["Accept"] = "multipart/mixed"
        if visibility_timeout_seconds is not None:
            request_headers["Vqs-Visibility-Timeout-Seconds"] = str(visibility_timeout_seconds)
        if limit is not None:
            request_headers["Vqs-Max-Messages"] = str(limit)
        deployment_id = _deployment_id(self._config)
        if deployment_id:
            request_headers["Vqs-Deployment-Id"] = deployment_id

        with httpx.Client(timeout=self._config.timeout) as client:
            response = client.post(
                _build_url(self._base_url(), queue_name, "consumer", consumer_group),
                headers=request_headers,
            )

        if response.status_code == 204:
            return []
        _raise_common_http_error(response, operation="receive messages")

        messages: list[ReceivedMessage] = []
        for part_headers, payload_bytes in _multipart_parts(response):
            parsed = _parse_message_part(part_headers, payload_bytes)
            if parsed is not None:
                messages.append(parsed)
        return messages

    def receive_by_id(
        self,
        queue_name: str,
        consumer_group: str,
        message_id: str,
        *,
        visibility_timeout_seconds: int | None = None,
    ) -> ReceivedMessage:
        request_headers = self._base_headers()
        request_headers["Authorization"] = f"Bearer {get_queue_token(self._config.token)}"
        request_headers["Accept"] = "multipart/mixed"
        if visibility_timeout_seconds is not None:
            request_headers["Vqs-Visibility-Timeout-Seconds"] = str(visibility_timeout_seconds)
        deployment_id = _deployment_id(self._config)
        if deployment_id:
            request_headers["Vqs-Deployment-Id"] = deployment_id

        with httpx.Client(timeout=self._config.timeout) as client:
            response = client.post(
                _build_url(
                    self._base_url(),
                    queue_name,
                    "consumer",
                    consumer_group,
                    "id",
                    message_id,
                ),
                headers=request_headers,
            )

        if response.status_code == 404:
            raise MessageNotFoundError(message_id)
        if response.status_code == 409:
            raise MessageNotAvailableError(message_id, response.text or None)
        if response.status_code == 410:
            raise MessageAlreadyProcessedError(message_id)
        _raise_common_http_error(response, operation="receive message by ID")

        for part_headers, payload_bytes in _multipart_parts(response):
            parsed = _parse_message_part(
                part_headers,
                payload_bytes,
                message_id_hint=message_id,
            )
            if parsed is not None:
                return parsed
        raise MessageCorruptedError(message_id, "Missing required queue headers in response")

    def acknowledge(
        self,
        queue_name: str,
        consumer_group: str,
        receipt_handle: str,
    ) -> None:
        request_headers = self._base_headers()
        request_headers["Authorization"] = f"Bearer {get_queue_token(self._config.token)}"
        deployment_id = _deployment_id(self._config)
        if deployment_id:
            request_headers["Vqs-Deployment-Id"] = deployment_id

        with httpx.Client(timeout=self._config.timeout) as client:
            response = client.delete(
                _build_url(
                    self._base_url(),
                    queue_name,
                    "consumer",
                    consumer_group,
                    "lease",
                    receipt_handle,
                ),
                headers=request_headers,
            )

        if response.status_code == 404:
            raise MessageNotFoundError(receipt_handle)
        if response.status_code == 409:
            raise MessageNotAvailableError(receipt_handle, response.text or None)
        _raise_common_http_error(
            response,
            operation="acknowledge message",
            bad_request_default="Missing or invalid receipt handle",
        )

    def change_visibility(
        self,
        queue_name: str,
        consumer_group: str,
        receipt_handle: str,
        visibility_timeout_seconds: int,
    ) -> None:
        request_headers = self._base_headers()
        request_headers["Authorization"] = f"Bearer {get_queue_token(self._config.token)}"
        request_headers["Content-Type"] = "application/json"
        deployment_id = _deployment_id(self._config)
        if deployment_id:
            request_headers["Vqs-Deployment-Id"] = deployment_id

        with httpx.Client(timeout=self._config.timeout) as client:
            response = client.patch(
                _build_url(
                    self._base_url(),
                    queue_name,
                    "consumer",
                    consumer_group,
                    "lease",
                    receipt_handle,
                ),
                headers=request_headers,
                content=json.dumps({"visibilityTimeoutSeconds": visibility_timeout_seconds}).encode(
                    "utf-8"
                ),
            )

        if response.status_code == 404:
            raise MessageNotFoundError(receipt_handle)
        if response.status_code == 409:
            raise MessageNotAvailableError(receipt_handle, response.text or None)
        _raise_common_http_error(
            response,
            operation="change visibility",
            bad_request_default="Missing receipt handle or invalid visibility timeout",
        )


class AsyncQueueClient(_BaseQueueClient):
    def with_region(self, region: str) -> AsyncQueueClient:
        return AsyncQueueClient(
            region=region,
            token=self._config.token,
            base_url=self._config.base_url,
            resolve_base_url=self._config.resolve_base_url,
            deployment_id=self._config.deployment_id,
            timeout=self._config.timeout,
            headers=self._config.headers,
            json_encoder=self._config.json_encoder,
        )

    async def send(
        self,
        queue_name: str,
        payload: Any,
        *,
        idempotency_key: str | None = None,
        retention_seconds: int | None = None,
        delay_seconds: int | None = None,
        content_type: str = "application/json",
        headers: dict[str, str] | None = None,
    ) -> SendMessageResult:
        request_headers = self._base_headers()
        _apply_passthrough_headers(request_headers, headers)
        token = await get_queue_token_async(self._config.token)
        request_headers["Authorization"] = f"Bearer {token}"
        request_headers["Content-Type"] = content_type

        deployment_id = _deployment_id(self._config)
        if deployment_id:
            request_headers["Vqs-Deployment-Id"] = deployment_id
        if idempotency_key:
            request_headers["Vqs-Idempotency-Key"] = idempotency_key
        if retention_seconds is not None:
            request_headers["Vqs-Retention-Seconds"] = str(retention_seconds)
        if delay_seconds is not None:
            request_headers["Vqs-Delay-Seconds"] = str(delay_seconds)

        body = _serialize_payload(
            payload,
            content_type=content_type,
            json_encoder=self._config.json_encoder,
        )

        async with httpx.AsyncClient(timeout=self._config.timeout) as client:
            response = await client.post(
                _build_url(self._base_url(), queue_name),
                content=body,
                headers=request_headers,
            )

        if response.status_code == 409:
            raise DuplicateIdempotencyKeyError(
                response.text or "Duplicate idempotency key detected",
            )
        _raise_common_http_error(response, operation="send message")
        return _parse_send_result(response)

    async def receive(
        self,
        queue_name: str,
        consumer_group: str,
        *,
        limit: int | None = 1,
        visibility_timeout_seconds: int | None = None,
    ) -> list[ReceivedMessage]:
        if limit is not None and (limit < 1 or limit > 10):
            raise InvalidLimitError(limit)

        request_headers = self._base_headers()
        token = await get_queue_token_async(self._config.token)
        request_headers["Authorization"] = f"Bearer {token}"
        request_headers["Accept"] = "multipart/mixed"
        if visibility_timeout_seconds is not None:
            request_headers["Vqs-Visibility-Timeout-Seconds"] = str(visibility_timeout_seconds)
        if limit is not None:
            request_headers["Vqs-Max-Messages"] = str(limit)
        deployment_id = _deployment_id(self._config)
        if deployment_id:
            request_headers["Vqs-Deployment-Id"] = deployment_id

        async with httpx.AsyncClient(timeout=self._config.timeout) as client:
            response = await client.post(
                _build_url(self._base_url(), queue_name, "consumer", consumer_group),
                headers=request_headers,
            )

        if response.status_code == 204:
            return []
        _raise_common_http_error(response, operation="receive messages")

        messages: list[ReceivedMessage] = []
        for part_headers, payload_bytes in _multipart_parts(response):
            parsed = _parse_message_part(part_headers, payload_bytes)
            if parsed is not None:
                messages.append(parsed)
        return messages

    async def receive_by_id(
        self,
        queue_name: str,
        consumer_group: str,
        message_id: str,
        *,
        visibility_timeout_seconds: int | None = None,
    ) -> ReceivedMessage:
        request_headers = self._base_headers()
        token = await get_queue_token_async(self._config.token)
        request_headers["Authorization"] = f"Bearer {token}"
        request_headers["Accept"] = "multipart/mixed"
        if visibility_timeout_seconds is not None:
            request_headers["Vqs-Visibility-Timeout-Seconds"] = str(visibility_timeout_seconds)
        deployment_id = _deployment_id(self._config)
        if deployment_id:
            request_headers["Vqs-Deployment-Id"] = deployment_id

        async with httpx.AsyncClient(timeout=self._config.timeout) as client:
            response = await client.post(
                _build_url(
                    self._base_url(),
                    queue_name,
                    "consumer",
                    consumer_group,
                    "id",
                    message_id,
                ),
                headers=request_headers,
            )

        if response.status_code == 404:
            raise MessageNotFoundError(message_id)
        if response.status_code == 409:
            raise MessageNotAvailableError(message_id, response.text or None)
        if response.status_code == 410:
            raise MessageAlreadyProcessedError(message_id)
        _raise_common_http_error(response, operation="receive message by ID")

        for part_headers, payload_bytes in _multipart_parts(response):
            parsed = _parse_message_part(
                part_headers,
                payload_bytes,
                message_id_hint=message_id,
            )
            if parsed is not None:
                return parsed
        raise MessageCorruptedError(message_id, "Missing required queue headers in response")

    async def acknowledge(
        self,
        queue_name: str,
        consumer_group: str,
        receipt_handle: str,
    ) -> None:
        request_headers = self._base_headers()
        token = await get_queue_token_async(self._config.token)
        request_headers["Authorization"] = f"Bearer {token}"
        deployment_id = _deployment_id(self._config)
        if deployment_id:
            request_headers["Vqs-Deployment-Id"] = deployment_id

        async with httpx.AsyncClient(timeout=self._config.timeout) as client:
            response = await client.delete(
                _build_url(
                    self._base_url(),
                    queue_name,
                    "consumer",
                    consumer_group,
                    "lease",
                    receipt_handle,
                ),
                headers=request_headers,
            )

        if response.status_code == 404:
            raise MessageNotFoundError(receipt_handle)
        if response.status_code == 409:
            raise MessageNotAvailableError(receipt_handle, response.text or None)
        _raise_common_http_error(
            response,
            operation="acknowledge message",
            bad_request_default="Missing or invalid receipt handle",
        )

    async def change_visibility(
        self,
        queue_name: str,
        consumer_group: str,
        receipt_handle: str,
        visibility_timeout_seconds: int,
    ) -> None:
        request_headers = self._base_headers()
        token = await get_queue_token_async(self._config.token)
        request_headers["Authorization"] = f"Bearer {token}"
        request_headers["Content-Type"] = "application/json"
        deployment_id = _deployment_id(self._config)
        if deployment_id:
            request_headers["Vqs-Deployment-Id"] = deployment_id

        async with httpx.AsyncClient(timeout=self._config.timeout) as client:
            response = await client.patch(
                _build_url(
                    self._base_url(),
                    queue_name,
                    "consumer",
                    consumer_group,
                    "lease",
                    receipt_handle,
                ),
                headers=request_headers,
                content=json.dumps({"visibilityTimeoutSeconds": visibility_timeout_seconds}).encode(
                    "utf-8"
                ),
            )

        if response.status_code == 404:
            raise MessageNotFoundError(receipt_handle)
        if response.status_code == 409:
            raise MessageNotAvailableError(receipt_handle, response.text or None)
        _raise_common_http_error(
            response,
            operation="change visibility",
            bad_request_default="Missing receipt handle or invalid visibility timeout",
        )


def get_queue_token(explicit_token: str | None = None) -> str:
    if explicit_token:
        return explicit_token

    env_token = os.environ.get("VERCEL_QUEUE_TOKEN")
    if env_token:
        return env_token

    from vercel.oidc import get_vercel_oidc_token  # type: ignore[import-not-found]

    token = get_vercel_oidc_token()
    if token:
        return token

    raise TokenResolutionError(
        "Failed to resolve queue token. Provide 'token' explicitly, "
        "set VERCEL_QUEUE_TOKEN, or ensure a Vercel OIDC token is available.",
    )


async def get_queue_token_async(explicit_token: str | None = None) -> str:
    if explicit_token:
        return explicit_token

    env_token = os.environ.get("VERCEL_QUEUE_TOKEN")
    if env_token:
        return env_token

    from vercel.oidc.aio import (  # type: ignore[import-not-found]
        get_vercel_oidc_token as get_vercel_oidc_token_async,
    )

    token = await get_vercel_oidc_token_async()
    if token:
        return token

    raise TokenResolutionError(
        "Failed to resolve queue token. Provide 'token' explicitly, "
        "set VERCEL_QUEUE_TOKEN, or ensure a Vercel OIDC token is available.",
    )


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

    from . import callback as queue_callback

    visibility_timeout_seconds = int(os.environ.get("VQS_VISIBILITY_TIMEOUT", "30"))
    refresh_interval_seconds = float(os.environ.get("VQS_VISIBILITY_REFRESH_INTERVAL", "10"))
    client = QueueClient()
    return queue_callback.handle_callback(
        client,
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
    resolve_base_url: BaseUrlResolver | None = None,
    region: str | None = None,
    content_type: str = "application/json",
    timeout: float | None = 10.0,
    headers: dict[str, str] | None = None,
    json_encoder: type[json.JSONEncoder] | None = None,
) -> SendMessageResult:
    return QueueClient(
        region=region,
        token=token,
        base_url=base_url,
        resolve_base_url=resolve_base_url,
        deployment_id=deployment_id,
        timeout=timeout,
        json_encoder=json_encoder,
    ).send(
        queue_name,
        payload,
        idempotency_key=idempotency_key,
        retention_seconds=retention_seconds,
        delay_seconds=delay_seconds,
        content_type=content_type,
        headers=headers,
    )


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
    resolve_base_url: BaseUrlResolver | None = None,
    region: str | None = None,
    content_type: str = "application/json",
    timeout: float | None = 10.0,
    headers: dict[str, str] | None = None,
    json_encoder: type[json.JSONEncoder] | None = None,
) -> SendMessageResult:
    return await AsyncQueueClient(
        region=region,
        token=token,
        base_url=base_url,
        resolve_base_url=resolve_base_url,
        deployment_id=deployment_id,
        timeout=timeout,
        json_encoder=json_encoder,
    ).send(
        queue_name,
        payload,
        idempotency_key=idempotency_key,
        retention_seconds=retention_seconds,
        delay_seconds=delay_seconds,
        content_type=content_type,
        headers=headers,
    )
