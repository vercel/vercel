from __future__ import annotations

import asyncio
import json
import os
import threading
from collections.abc import Awaitable, Callable
from email.parser import BytesParser
from email.policy import default as _email_default_policy
from typing import Any
from urllib.parse import quote

import httpx

from vercel.workers._queue.exceptions import (
    BadRequestError,
    InternalServerError,
    MessageCorruptedError,
    MessageNotAvailableError,
    MessageNotFoundError,
    ThrottledError,
    UnauthorizedError,
)
from vercel.workers._queue.send import (
    get_queue_base_path,
    get_queue_base_url,
    get_queue_token,
    get_queue_token_async,
)
from vercel.workers._queue.types import ReceivedMessage


def parse_retry_after(response: httpx.Response) -> int | None:
    value = response.headers.get("Retry-After")
    if not value:
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def parse_multipart_message(
    response: httpx.Response,
) -> tuple[dict[str, str], bytes]:
    content_type = response.headers.get("Content-Type") or ""
    if "multipart" not in content_type.lower():
        raise RuntimeError(f"Expected multipart/mixed response, got Content-Type={content_type!r}")

    raw = (f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n").encode(
        "latin1"
    ) + response.content

    msg = BytesParser(policy=_email_default_policy).parsebytes(raw)  # type: ignore[arg-type]
    if not msg.is_multipart():
        raise RuntimeError("Expected multipart response, got non-multipart payload")

    for part in msg.walk():
        # Skip the multipart container itself
        if part.is_multipart():
            continue
        headers = dict(part.items())
        payload = part.get_payload(decode=True)
        payload_bytes: bytes = payload if isinstance(payload, bytes) else b""
        return headers, payload_bytes

    raise RuntimeError("Multipart response contained no parts")


def parse_multipart_messages(
    response: httpx.Response,
) -> list[tuple[dict[str, str], bytes]]:
    """
    Parse a multipart/mixed response into a list of (headers, payload_bytes).

    Note: This reads the full response content into memory.
    """

    content_type = response.headers.get("Content-Type") or ""
    if "multipart" not in content_type.lower():
        raise RuntimeError(f"Expected multipart/mixed response, got Content-Type={content_type!r}")

    raw = (f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n").encode(
        "latin1"
    ) + response.content

    msg = BytesParser(policy=_email_default_policy).parsebytes(raw)  # type: ignore[arg-type]
    if not msg.is_multipart():
        raise RuntimeError("Expected multipart response, got non-multipart payload")

    parts: list[tuple[dict[str, str], bytes]] = []
    for part in msg.walk():
        # Skip the multipart container itself
        if part.is_multipart():
            continue
        headers = dict(part.items())
        payload = part.get_payload(decode=True)
        payload_bytes: bytes = payload if isinstance(payload, bytes) else b""
        parts.append((headers, payload_bytes))

    return parts


def _queue_consumer_url(
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


def _queue_headers(
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


def _decode_payload(
    payload_bytes: bytes,
    content_type: str,
    message_id: str,
) -> Any:
    if "application/json" not in content_type.lower():
        return payload_bytes

    try:
        return json.loads(payload_bytes.decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise MessageCorruptedError(
            message_id,
            f"Failed to parse payload as JSON: {exc}",
        ) from exc


def _delivery_count_from_headers(part_headers: dict[str, str]) -> int:
    delivery_count_raw = part_headers.get("Vqs-Delivery-Count") or "0"
    try:
        return int(delivery_count_raw)
    except ValueError:
        return 0


def _raise_for_receive_messages_response(response: httpx.Response) -> None:
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


def _raise_for_receive_by_id_response(
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


def _parse_receive_by_id_response(
    response: httpx.Response,
    message_id: str,
) -> tuple[Any, int, str, str]:
    try:
        part_headers, payload_bytes = parse_multipart_message(response)
    except Exception as exc:
        raise MessageCorruptedError(
            message_id,
            f"Failed to parse multipart response: {exc}",
        ) from exc

    timestamp = part_headers.get("Vqs-Timestamp") or ""
    receipt_handle = part_headers.get("Vqs-Receipt-Handle")

    if not receipt_handle:
        raise MessageCorruptedError(
            message_id,
            "Missing required queue header 'Vqs-Receipt-Handle' in multipart response",
        )

    content_type = part_headers.get("Content-Type", "")
    payload = _decode_payload(payload_bytes, content_type, message_id)
    return payload, _delivery_count_from_headers(part_headers), timestamp, receipt_handle


def _raise_for_lease_response(
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


def _parse_receive_messages_response(response: httpx.Response) -> list[ReceivedMessage]:
    messages: list[ReceivedMessage] = []
    for part_headers, payload_bytes in parse_multipart_messages(response):
        message_id = part_headers.get("Vqs-Message-Id")
        receipt_handle = part_headers.get("Vqs-Receipt-Handle")
        timestamp = part_headers.get("Vqs-Timestamp") or ""
        content_type = part_headers.get("Content-Type", "")

        if not message_id or not receipt_handle:
            # Skip malformed parts
            continue

        payload = _decode_payload(payload_bytes, content_type, str(message_id))

        messages.append(
            {
                "messageId": str(message_id),
                "deliveryCount": _delivery_count_from_headers(part_headers),
                "createdAt": str(timestamp),
                "receipt_handle": str(receipt_handle),
                "contentType": str(content_type),
                "payload": payload,
            }
        )

    return messages


def receive_messages(
    queue_name: str,
    consumer_group: str,
    *,
    limit: int = 1,
    visibility_timeout_seconds: int | None = None,
    timeout: float | None = 10.0,
) -> list[ReceivedMessage]:
    """
    Receive one or more messages from a queue.

    POST {base_url}{base_path}/{queue_name}/consumer/{consumer_group}
    Accept: multipart/mixed

    Returns a list of messages (possibly empty).
    """

    auth_token = get_queue_token(None)
    headers = _queue_headers(
        auth_token,
        accept="multipart/mixed",
        visibility_timeout_seconds=visibility_timeout_seconds,
        limit=limit,
    )
    url = _queue_consumer_url(queue_name, consumer_group)
    with httpx.Client(timeout=timeout) as client:
        response = client.post(url, headers=headers)

    if response.status_code == 204:
        return []
    _raise_for_receive_messages_response(response)

    return _parse_receive_messages_response(response)


async def receive_messages_async(
    queue_name: str,
    consumer_group: str,
    *,
    limit: int = 1,
    visibility_timeout_seconds: int | None = None,
    timeout: float | None = 10.0,
) -> list[ReceivedMessage]:
    """
    Async variant of receive_messages().
    """
    auth_token = await get_queue_token_async(None)
    headers = _queue_headers(
        auth_token,
        accept="multipart/mixed",
        visibility_timeout_seconds=visibility_timeout_seconds,
        limit=limit,
    )
    url = _queue_consumer_url(queue_name, consumer_group)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, headers=headers)

    if response.status_code == 204:
        return []
    _raise_for_receive_messages_response(response)

    return _parse_receive_messages_response(response)


def receive_message_by_id(
    queue_name: str,
    consumer_group: str,
    message_id: str,
    *,
    visibility_timeout_seconds: int | None = None,
    timeout: float | None = 10.0,
) -> tuple[Any, int, str, str]:
    """
    Minimal receive-by-id:

      POST {base_url}{base_path}/{queue_name}/consumer/{consumer_group}/id/{messageId}
      Accept: multipart/mixed

    Returns (payload, delivery_count, created_at, receipt_handle).
    """
    auth_token = get_queue_token(None)
    headers = _queue_headers(
        auth_token,
        accept="multipart/mixed",
        visibility_timeout_seconds=visibility_timeout_seconds,
    )
    url = _queue_consumer_url(queue_name, consumer_group, "id", message_id)
    with httpx.Client(timeout=timeout) as client:
        response = client.post(url, headers=headers)

    _raise_for_receive_by_id_response(response, message_id)
    return _parse_receive_by_id_response(response, message_id)


async def receive_message_by_id_async(
    queue_name: str,
    consumer_group: str,
    message_id: str,
    *,
    visibility_timeout_seconds: int | None = None,
    timeout: float | None = 10.0,
) -> tuple[Any, int, str, str]:
    """
    Async variant of receive_message_by_id().
    """
    auth_token = await get_queue_token_async(None)
    headers = _queue_headers(
        auth_token,
        accept="multipart/mixed",
        visibility_timeout_seconds=visibility_timeout_seconds,
    )
    url = _queue_consumer_url(queue_name, consumer_group, "id", message_id)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, headers=headers)

    _raise_for_receive_by_id_response(response, message_id)
    return _parse_receive_by_id_response(response, message_id)


def delete_message(
    queue_name: str,
    consumer_group: str,
    message_id: str,
    receipt_handle: str,
    *,
    timeout: float | None = 10.0,
) -> None:
    auth_token = get_queue_token(None)
    headers = _queue_headers(auth_token)
    url = _queue_consumer_url(queue_name, consumer_group, "lease", receipt_handle)
    with httpx.Client(timeout=timeout) as client:
        response = client.delete(url, headers=headers)

    _raise_for_lease_response(
        response,
        message_id,
        bad_request_message="Missing or invalid receipt handle",
    )


async def delete_message_async(
    queue_name: str,
    consumer_group: str,
    message_id: str,
    receipt_handle: str,
    *,
    timeout: float | None = 10.0,
) -> None:
    auth_token = await get_queue_token_async(None)
    headers = _queue_headers(auth_token)
    url = _queue_consumer_url(queue_name, consumer_group, "lease", receipt_handle)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.delete(url, headers=headers)

    _raise_for_lease_response(
        response,
        message_id,
        bad_request_message="Missing or invalid receipt handle",
    )


def change_visibility(
    queue_name: str,
    consumer_group: str,
    message_id: str,
    receipt_handle: str,
    visibility_timeout_seconds: int,
    *,
    timeout: float | None = 10.0,
) -> None:
    auth_token = get_queue_token(None)
    headers = _queue_headers(auth_token, content_type="application/json")
    body = json.dumps({"visibilityTimeoutSeconds": visibility_timeout_seconds})
    url = _queue_consumer_url(queue_name, consumer_group, "lease", receipt_handle)
    with httpx.Client(timeout=timeout) as client:
        response = client.patch(url, content=body.encode("utf-8"), headers=headers)

    _raise_for_lease_response(
        response,
        message_id,
        bad_request_message="Missing receipt handle or invalid visibility timeout",
    )


async def change_visibility_async(
    queue_name: str,
    consumer_group: str,
    message_id: str,
    receipt_handle: str,
    visibility_timeout_seconds: int,
    *,
    timeout: float | None = 10.0,
) -> None:
    auth_token = await get_queue_token_async(None)
    headers = _queue_headers(auth_token, content_type="application/json")
    body = json.dumps({"visibilityTimeoutSeconds": visibility_timeout_seconds})
    url = _queue_consumer_url(queue_name, consumer_group, "lease", receipt_handle)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.patch(url, content=body.encode("utf-8"), headers=headers)

    _raise_for_lease_response(
        response,
        message_id,
        bad_request_message="Missing receipt handle or invalid visibility timeout",
    )


class VisibilityExtender:
    """
    Visibility timeout extension loop.

    This mirrors the Node client behavior: while a message is being processed, periodically
    call change_visibility() to prevent the message from being redelivered to another
    consumer before processing completes.

    The implementation uses a lock so the final ACK (delete) or delay (change_visibility)
    can be performed exclusively without being overwritten by an in-flight extension call.
    """

    def __init__(
        self,
        queue_name: str,
        consumer_group: str,
        message_id: str,
        receipt_handle: str,
        *,
        visibility_timeout_seconds: int,
        refresh_interval_seconds: float,
        timeout: float | None = 10.0,
        debug: bool = False,
    ) -> None:
        self.queue_name = queue_name
        self.consumer_group = consumer_group
        self.message_id = message_id
        self.receipt_handle = receipt_handle
        self.visibility_timeout_seconds = int(visibility_timeout_seconds)
        self.refresh_interval_seconds = float(refresh_interval_seconds)
        self.timeout = timeout
        self.debug = debug

        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self.refresh_interval_seconds <= 0:
            return

        # Daemon thread so it won't block serverless shutdown.
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def finalize(self, fn: Callable[[], None]) -> None:
        """
        Stop the extension loop and run `fn` (delete/change-visibility) exclusively.
        """
        self._stop.set()
        with self._lock:
            fn()

    def _run(self) -> None:
        while True:
            # Wait for the next refresh tick (or stop).
            if self._stop.wait(self.refresh_interval_seconds):
                return

            with self._lock:
                if self._stop.is_set():
                    return
                try:
                    change_visibility(
                        self.queue_name,
                        self.consumer_group,
                        self.message_id,
                        self.receipt_handle,
                        int(self.visibility_timeout_seconds),
                        timeout=self.timeout,
                    )
                except Exception as exc:  # noqa: BLE001
                    if self.debug:
                        print(
                            "[vercelqueue] visibility extension failed",
                            {
                                "queue": self.queue_name,
                                "consumer": self.consumer_group,
                                "messageId": self.message_id,
                                "error": repr(exc),
                            },
                        )
                    # Fail fast; we'll rely on the current visibility timeout.
                    return


class AsyncVisibilityExtender:
    """
    Asyncio visibility timeout extension loop.

    Used by ASGI callbacks to keep queue lease operations on the running event loop.
    """

    def __init__(
        self,
        queue_name: str,
        consumer_group: str,
        message_id: str,
        receipt_handle: str,
        *,
        visibility_timeout_seconds: int,
        refresh_interval_seconds: float,
        timeout: float | None = 10.0,
        debug: bool = False,
    ) -> None:
        self.queue_name = queue_name
        self.consumer_group = consumer_group
        self.message_id = message_id
        self.receipt_handle = receipt_handle
        self.visibility_timeout_seconds = int(visibility_timeout_seconds)
        self.refresh_interval_seconds = float(refresh_interval_seconds)
        self.timeout = timeout
        self.debug = debug

        self._stop: asyncio.Event | None = None
        self._lock = asyncio.Lock()
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        if self.refresh_interval_seconds <= 0:
            return

        self._stop = asyncio.Event()
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._stop is not None:
            self._stop.set()
        if self._task is not None and self._task is not asyncio.current_task():
            await self._task

    async def finalize(self, fn: Callable[[], Awaitable[None]]) -> None:
        """
        Stop the extension loop and run `fn` (delete/change-visibility) exclusively.
        """
        if self._stop is not None:
            self._stop.set()
        async with self._lock:
            await fn()

    async def _run(self) -> None:
        stop = self._stop
        if stop is None:
            return

        while True:
            try:
                _ = await asyncio.wait_for(
                    stop.wait(),
                    timeout=self.refresh_interval_seconds,
                )
                return
            except TimeoutError:
                pass

            async with self._lock:
                if stop.is_set():
                    return
                try:
                    await change_visibility_async(
                        self.queue_name,
                        self.consumer_group,
                        self.message_id,
                        self.receipt_handle,
                        int(self.visibility_timeout_seconds),
                        timeout=self.timeout,
                    )
                except Exception as exc:  # noqa: BLE001
                    if self.debug:
                        print(
                            "[vercelqueue] visibility extension failed",
                            {
                                "queue": self.queue_name,
                                "consumer": self.consumer_group,
                                "messageId": self.message_id,
                                "error": repr(exc),
                            },
                        )
                    # Fail fast; we'll rely on the current visibility timeout.
                    return


__all__ = [
    "AsyncVisibilityExtender",
    "ReceivedMessage",
    "VisibilityExtender",
    "change_visibility",
    "change_visibility_async",
    "delete_message",
    "delete_message_async",
    "parse_multipart_message",
    "parse_multipart_messages",
    "parse_retry_after",
    "receive_message_by_id_async",
    "receive_message_by_id",
    "receive_messages",
    "receive_messages_async",
]
