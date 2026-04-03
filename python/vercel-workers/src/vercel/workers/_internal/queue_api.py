from __future__ import annotations

import json
import os
from collections.abc import Mapping
from dataclasses import dataclass
from email.parser import BytesParser
from email.policy import default as _email_default_policy
from typing import Any
from urllib.parse import quote

import httpx

from vercel.oidc import get_vercel_oidc_token, get_vercel_oidc_token_async

from ..exceptions import (
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
from ..types import BaseUrlResolver, ReceivedMessage, SendMessageResult, WorkerJSONEncoder

BASE_PATH = "/api/v3/topic"
DEFAULT_REGION = "iad1"


@dataclass(frozen=True)
class QueueClientConfig:
    region: str
    token: str | None = None
    base_url: str | None = None
    resolve_base_url: BaseUrlResolver | None = None
    deployment_id: str | None = None
    timeout: float | None = 10.0
    headers: dict[str, str] | None = None
    json_encoder: type[json.JSONEncoder] | None = None


def resolve_region(region: str | None = None) -> str:
    return region or os.environ.get("VERCEL_REGION") or DEFAULT_REGION


def create_client_config(
    *,
    region: str | None = None,
    token: str | None = None,
    base_url: str | None = None,
    resolve_base_url: BaseUrlResolver | None = None,
    deployment_id: str | None = None,
    timeout: float | None = 10.0,
    headers: dict[str, str] | None = None,
    json_encoder: type[json.JSONEncoder] | None = None,
) -> QueueClientConfig:
    return QueueClientConfig(
        region=resolve_region(region),
        token=token,
        base_url=base_url,
        resolve_base_url=resolve_base_url,
        deployment_id=deployment_id,
        timeout=timeout,
        headers=dict(headers) if headers is not None else None,
        json_encoder=json_encoder,
    )


def get_queue_base_url(region: str | None = None) -> str:
    explicit = os.environ.get("VERCEL_QUEUE_BASE_URL")
    if explicit:
        return explicit.rstrip("/")
    return f"https://{resolve_region(region)}.vercel-queue.com"


def compose_base_url(
    base_url: str | None,
    base_path: str | None,
    *,
    region: str | None = None,
) -> str | None:
    if not base_path:
        return base_url

    normalized_path = base_path.strip().rstrip("/")
    if normalized_path == BASE_PATH:
        prefix = ""
    elif normalized_path.endswith(BASE_PATH):
        prefix = normalized_path[: -len(BASE_PATH)]
    else:
        raise ValueError(
            f"Invalid base_path {base_path!r}. "
            f"Expected a path ending with {BASE_PATH!r}.",
        )

    prefix = prefix.rstrip("/")
    if not prefix:
        return base_url

    root = (base_url or get_queue_base_url(region)).rstrip("/")
    normalized_prefix = prefix if prefix.startswith("/") else f"/{prefix}"
    return f"{root}{normalized_prefix}"


def get_queue_token(explicit_token: str | None = None) -> str:
    if explicit_token:
        return explicit_token

    env_token = os.environ.get("VERCEL_QUEUE_TOKEN")
    if env_token:
        return env_token

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

    token = await get_vercel_oidc_token_async()
    if token:
        return token

    raise TokenResolutionError(
        "Failed to resolve queue token. Provide 'token' explicitly, "
        "set VERCEL_QUEUE_TOKEN, or ensure a Vercel OIDC token is available.",
    )


def _resolve_base_url(config: QueueClientConfig) -> str:
    if config.base_url:
        return config.base_url.rstrip("/")
    if config.resolve_base_url is not None:
        return config.resolve_base_url(config.region).rstrip("/")
    return get_queue_base_url(config.region)


def _build_url(base_url: str, queue_name: str, *path_segments: str) -> str:
    encoded_queue = quote(queue_name, safe="")
    encoded_segments = "/".join(quote(segment, safe="") for segment in path_segments)
    suffix = f"/{encoded_segments}" if encoded_segments else ""
    return f"{base_url.rstrip('/')}{BASE_PATH}/{encoded_queue}{suffix}"


def _deployment_id(config: QueueClientConfig) -> str | None:
    return config.deployment_id or os.environ.get("VERCEL_DEPLOYMENT_ID")


def _base_headers(config: QueueClientConfig) -> dict[str, str]:
    return dict(config.headers or {})


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


def send_message(
    config: QueueClientConfig,
    queue_name: str,
    payload: Any,
    *,
    idempotency_key: str | None = None,
    retention_seconds: int | None = None,
    delay_seconds: int | None = None,
    content_type: str = "application/json",
    headers: Mapping[str, str] | None = None,
) -> SendMessageResult:
    request_headers = _base_headers(config)
    _apply_passthrough_headers(request_headers, headers)
    request_headers["Authorization"] = f"Bearer {get_queue_token(config.token)}"
    request_headers["Content-Type"] = content_type

    deployment_id = _deployment_id(config)
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
        json_encoder=config.json_encoder,
    )

    with httpx.Client(timeout=config.timeout) as client:
        response = client.post(
            _build_url(_resolve_base_url(config), queue_name),
            content=body,
            headers=request_headers,
        )

    if response.status_code == 409:
        raise DuplicateIdempotencyKeyError(response.text or "Duplicate idempotency key detected")
    _raise_common_http_error(response, operation="send message")
    return _parse_send_result(response)


async def send_message_async(
    config: QueueClientConfig,
    queue_name: str,
    payload: Any,
    *,
    idempotency_key: str | None = None,
    retention_seconds: int | None = None,
    delay_seconds: int | None = None,
    content_type: str = "application/json",
    headers: Mapping[str, str] | None = None,
) -> SendMessageResult:
    request_headers = _base_headers(config)
    _apply_passthrough_headers(request_headers, headers)
    token = await get_queue_token_async(config.token)
    request_headers["Authorization"] = f"Bearer {token}"
    request_headers["Content-Type"] = content_type

    deployment_id = _deployment_id(config)
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
        json_encoder=config.json_encoder,
    )

    async with httpx.AsyncClient(timeout=config.timeout) as client:
        response = await client.post(
            _build_url(_resolve_base_url(config), queue_name),
            content=body,
            headers=request_headers,
        )

    if response.status_code == 409:
        raise DuplicateIdempotencyKeyError(response.text or "Duplicate idempotency key detected")
    _raise_common_http_error(response, operation="send message")
    return _parse_send_result(response)


def receive_messages(
    config: QueueClientConfig,
    queue_name: str,
    consumer_group: str,
    *,
    limit: int | None = 1,
    visibility_timeout_seconds: int | None = None,
) -> list[ReceivedMessage]:
    if limit is not None and not 1 <= limit <= 10:
        raise InvalidLimitError(limit)

    request_headers = _base_headers(config)
    request_headers["Authorization"] = f"Bearer {get_queue_token(config.token)}"
    request_headers["Accept"] = "multipart/mixed"

    if visibility_timeout_seconds is not None:
        request_headers["Vqs-Visibility-Timeout-Seconds"] = str(visibility_timeout_seconds)
    if limit is not None:
        request_headers["Vqs-Max-Messages"] = str(limit)

    deployment_id = _deployment_id(config)
    if deployment_id:
        request_headers["Vqs-Deployment-Id"] = deployment_id

    with httpx.Client(timeout=config.timeout) as client:
        response = client.post(
            _build_url(_resolve_base_url(config), queue_name, "consumer", consumer_group),
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


async def receive_messages_async(
    config: QueueClientConfig,
    queue_name: str,
    consumer_group: str,
    *,
    limit: int | None = 1,
    visibility_timeout_seconds: int | None = None,
) -> list[ReceivedMessage]:
    if limit is not None and not 1 <= limit <= 10:
        raise InvalidLimitError(limit)

    request_headers = _base_headers(config)
    token = await get_queue_token_async(config.token)
    request_headers["Authorization"] = f"Bearer {token}"
    request_headers["Accept"] = "multipart/mixed"

    if visibility_timeout_seconds is not None:
        request_headers["Vqs-Visibility-Timeout-Seconds"] = str(visibility_timeout_seconds)
    if limit is not None:
        request_headers["Vqs-Max-Messages"] = str(limit)

    deployment_id = _deployment_id(config)
    if deployment_id:
        request_headers["Vqs-Deployment-Id"] = deployment_id

    async with httpx.AsyncClient(timeout=config.timeout) as client:
        response = await client.post(
            _build_url(_resolve_base_url(config), queue_name, "consumer", consumer_group),
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


def receive_message_by_id(
    config: QueueClientConfig,
    queue_name: str,
    consumer_group: str,
    message_id: str,
    *,
    visibility_timeout_seconds: int | None = None,
) -> ReceivedMessage:
    request_headers = _base_headers(config)
    request_headers["Authorization"] = f"Bearer {get_queue_token(config.token)}"
    request_headers["Accept"] = "multipart/mixed"

    if visibility_timeout_seconds is not None:
        request_headers["Vqs-Visibility-Timeout-Seconds"] = str(visibility_timeout_seconds)

    deployment_id = _deployment_id(config)
    if deployment_id:
        request_headers["Vqs-Deployment-Id"] = deployment_id

    with httpx.Client(timeout=config.timeout) as client:
        response = client.post(
            _build_url(
                _resolve_base_url(config),
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


async def receive_message_by_id_async(
    config: QueueClientConfig,
    queue_name: str,
    consumer_group: str,
    message_id: str,
    *,
    visibility_timeout_seconds: int | None = None,
) -> ReceivedMessage:
    request_headers = _base_headers(config)
    token = await get_queue_token_async(config.token)
    request_headers["Authorization"] = f"Bearer {token}"
    request_headers["Accept"] = "multipart/mixed"

    if visibility_timeout_seconds is not None:
        request_headers["Vqs-Visibility-Timeout-Seconds"] = str(visibility_timeout_seconds)

    deployment_id = _deployment_id(config)
    if deployment_id:
        request_headers["Vqs-Deployment-Id"] = deployment_id

    async with httpx.AsyncClient(timeout=config.timeout) as client:
        response = await client.post(
            _build_url(
                _resolve_base_url(config),
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


def acknowledge_message(
    config: QueueClientConfig,
    queue_name: str,
    consumer_group: str,
    receipt_handle: str,
) -> None:
    request_headers = _base_headers(config)
    request_headers["Authorization"] = f"Bearer {get_queue_token(config.token)}"

    deployment_id = _deployment_id(config)
    if deployment_id:
        request_headers["Vqs-Deployment-Id"] = deployment_id

    with httpx.Client(timeout=config.timeout) as client:
        response = client.delete(
            _build_url(
                _resolve_base_url(config),
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


async def acknowledge_message_async(
    config: QueueClientConfig,
    queue_name: str,
    consumer_group: str,
    receipt_handle: str,
) -> None:
    request_headers = _base_headers(config)
    token = await get_queue_token_async(config.token)
    request_headers["Authorization"] = f"Bearer {token}"

    deployment_id = _deployment_id(config)
    if deployment_id:
        request_headers["Vqs-Deployment-Id"] = deployment_id

    async with httpx.AsyncClient(timeout=config.timeout) as client:
        response = await client.delete(
            _build_url(
                _resolve_base_url(config),
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


def change_message_visibility(
    config: QueueClientConfig,
    queue_name: str,
    consumer_group: str,
    receipt_handle: str,
    visibility_timeout_seconds: int,
) -> None:
    request_headers = _base_headers(config)
    request_headers["Authorization"] = f"Bearer {get_queue_token(config.token)}"
    request_headers["Content-Type"] = "application/json"

    deployment_id = _deployment_id(config)
    if deployment_id:
        request_headers["Vqs-Deployment-Id"] = deployment_id

    with httpx.Client(timeout=config.timeout) as client:
        response = client.patch(
            _build_url(
                _resolve_base_url(config),
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


async def change_message_visibility_async(
    config: QueueClientConfig,
    queue_name: str,
    consumer_group: str,
    receipt_handle: str,
    visibility_timeout_seconds: int,
) -> None:
    request_headers = _base_headers(config)
    token = await get_queue_token_async(config.token)
    request_headers["Authorization"] = f"Bearer {token}"
    request_headers["Content-Type"] = "application/json"

    deployment_id = _deployment_id(config)
    if deployment_id:
        request_headers["Vqs-Deployment-Id"] = deployment_id

    async with httpx.AsyncClient(timeout=config.timeout) as client:
        response = await client.patch(
            _build_url(
                _resolve_base_url(config),
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


__all__ = [
    "QueueClientConfig",
    "acknowledge_message",
    "acknowledge_message_async",
    "change_message_visibility",
    "change_message_visibility_async",
    "compose_base_url",
    "create_client_config",
    "get_queue_base_url",
    "get_queue_token",
    "get_queue_token_async",
    "receive_message_by_id",
    "receive_message_by_id_async",
    "receive_messages",
    "receive_messages_async",
    "send_message",
    "send_message_async",
]
