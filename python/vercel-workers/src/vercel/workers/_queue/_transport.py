from __future__ import annotations

import os
from urllib.parse import quote

import httpx

from vercel.workers._queue.exceptions import (
    BadRequestError,
    InternalServerError,
    MessageNotAvailableError,
    MessageNotFoundError,
    ThrottledError,
    UnauthorizedError,
)
from vercel.workers._queue.send import (
    get_queue_base_path,
    get_queue_base_url,
)


def parse_retry_after(response: httpx.Response) -> int | None:
    value = response.headers.get("Retry-After")
    if not value:
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def queue_consumer_url(
    queue_name: str,
    consumer_group: str,
    *suffix_parts: str,
) -> str:
    base_url = get_queue_base_url().rstrip("/")
    base_path = get_queue_base_path()
    path_parts = [
        quote(queue_name, safe=""),
        "consumer",
        quote(consumer_group, safe=""),
        *(quote(part, safe="") for part in suffix_parts),
    ]
    return f"{base_url}{base_path}/{'/'.join(path_parts)}"


def queue_headers(
    auth_token: str,
    *,
    accept: str | None = None,
    content_type: str | None = None,
    visibility_timeout_seconds: int | None = None,
    limit: int | None = None,
) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {auth_token}"}

    if accept is not None:
        headers["Accept"] = accept
    if content_type is not None:
        headers["Content-Type"] = content_type

    deployment_id = os.environ.get("VERCEL_DEPLOYMENT_ID")
    if deployment_id:
        headers["Vqs-Deployment-Id"] = deployment_id

    if visibility_timeout_seconds is not None:
        headers["Vqs-Visibility-Timeout-Seconds"] = str(int(visibility_timeout_seconds))
    if limit is not None:
        headers["Vqs-Max-Messages"] = str(int(limit))

    return headers


def raise_for_receive_messages_response(response: httpx.Response) -> None:
    if response.status_code == 400:
        raise BadRequestError(response.text or "Invalid parameters")
    if response.status_code == 401:
        raise UnauthorizedError()
    if response.status_code == 429:
        raise ThrottledError(parse_retry_after(response))
    if response.status_code >= 500:
        raise InternalServerError(
            response.text or f"Server error: {response.status_code} {response.reason_phrase}"
        )

    _ = response.raise_for_status()


def raise_for_receive_by_id_response(
    response: httpx.Response,
    message_id: str,
) -> None:
    if response.status_code == 400:
        raise BadRequestError(response.text or "Invalid parameters")
    if response.status_code == 401:
        raise UnauthorizedError()
    if response.status_code == 404:
        raise MessageNotFoundError(message_id)
    if response.status_code == 409:
        raise MessageNotAvailableError(message_id)
    if response.status_code == 410:
        raise MessageNotFoundError(message_id)
    if response.status_code == 429:
        raise ThrottledError(parse_retry_after(response))
    if response.status_code >= 500:
        raise InternalServerError(
            response.text or f"Server error: {response.status_code} {response.reason_phrase}"
        )

    _ = response.raise_for_status()


def raise_for_lease_response(
    response: httpx.Response,
    message_id: str,
    *,
    bad_request_message: str,
) -> None:
    if response.status_code == 400:
        raise BadRequestError(bad_request_message)
    if response.status_code == 401:
        raise UnauthorizedError()
    if response.status_code == 404:
        raise MessageNotFoundError(message_id)
    if response.status_code == 409:
        raise MessageNotAvailableError(message_id, "lease expired or receipt handle mismatch")
    if response.status_code == 429:
        raise ThrottledError(parse_retry_after(response))
    if response.status_code >= 500:
        raise InternalServerError(
            response.text or f"Server error: {response.status_code} {response.reason_phrase}"
        )

    _ = response.raise_for_status()


__all__ = [
    "parse_retry_after",
    "queue_consumer_url",
    "queue_headers",
    "raise_for_lease_response",
    "raise_for_receive_by_id_response",
    "raise_for_receive_messages_response",
]
