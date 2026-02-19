from __future__ import annotations

import json
import threading
from collections.abc import Callable
from email.parser import BytesParser
from email.policy import default as _email_default_policy
from typing import Any, TypedDict
from urllib.parse import quote

import httpx

from . import client as _client
from .exceptions import (
    BadRequestError,
    ForbiddenError,
    InternalServerError,
    MessageCorruptedError,
    MessageLockedError,
    MessageNotAvailableError,
    MessageNotFoundError,
    ThrottledError,
    UnauthorizedError,
)


class CloudEventData(TypedDict):
    messageId: str
    queueName: str
    consumerGroup: str


class CloudEvent(TypedDict, total=False):
    type: str
    source: str
    id: str
    datacontenttype: str
    data: CloudEventData
    time: str
    specversion: str


def parse_cloudevent(body: bytes) -> tuple[str, str, str]:
    if not body:
        raise ValueError("Empty request body")

    try:
        data: Any = json.loads(body.decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise ValueError("Failed to parse CloudEvent from request body") from exc

    if not isinstance(data, dict):
        raise ValueError("Invalid CloudEvent: body must be a JSON object")

    if data.get("type") != "com.vercel.queue.v1beta":
        raise ValueError(
            f"Invalid CloudEvent type: expected 'com.vercel.queue.v1beta', got {data.get('type')!r}"
        )

    ce_data = data.get("data")
    if not isinstance(ce_data, dict):
        raise ValueError("Invalid CloudEvent: 'data' must be an object")

    missing: list[str] = []
    if "queueName" not in ce_data:
        missing.append("queueName")
    if "consumerGroup" not in ce_data:
        missing.append("consumerGroup")
    if "messageId" not in ce_data:
        missing.append("messageId")
    if missing:
        raise ValueError(f"Missing required CloudEvent data fields: {', '.join(missing)}")

    queue_name = str(ce_data["queueName"])
    consumer_group = str(ce_data["consumerGroup"])
    message_id = str(ce_data["messageId"])
    return queue_name, consumer_group, message_id


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


class ReceivedMessage(TypedDict):
    messageId: str
    deliveryCount: int
    createdAt: str
    ticket: str
    contentType: str
    payload: Any


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

    GET {base_url}{base_path}
    Accept: multipart/mixed

    Returns a list of messages (possibly empty).
    """

    base_url = _client.get_queue_base_url().rstrip("/")
    base_path = _client.get_queue_base_path()
    auth_token = _client.get_queue_token(None)

    headers: dict[str, str] = {
        "Authorization": f"Bearer {auth_token}",
        "Vqs-Queue-Name": queue_name,
        "Vqs-Consumer-Group": consumer_group,
        "Accept": "multipart/mixed",
    }

    if visibility_timeout_seconds is not None:
        headers["Vqs-Visibility-Timeout"] = str(int(visibility_timeout_seconds))
    if limit is not None:
        headers["Vqs-Limit"] = str(int(limit))

    url = f"{base_url}{base_path}"
    with httpx.Client(timeout=timeout) as client:
        response = client.get(url, headers=headers)

    if response.status_code == 204:
        return []
    if response.status_code == 400:
        raise BadRequestError(response.text or "Invalid parameters")
    if response.status_code == 401:
        raise UnauthorizedError()
    if response.status_code == 403:
        raise ForbiddenError()
    if response.status_code == 429:
        raise ThrottledError(parse_retry_after(response))
    if response.status_code == 423:
        raise MessageLockedError("next message", parse_retry_after(response))
    if response.status_code >= 500:
        raise InternalServerError(
            response.text or f"Server error: {response.status_code} {response.reason_phrase}"
        )

    response.raise_for_status()

    messages: list[ReceivedMessage] = []
    for part_headers, payload_bytes in parse_multipart_messages(response):
        message_id = part_headers.get("Vqs-Message-Id")
        ticket = part_headers.get("Vqs-Ticket")
        timestamp = part_headers.get("Vqs-Timestamp") or ""
        delivery_count_raw = part_headers.get("Vqs-Delivery-Count") or "0"
        content_type = part_headers.get("Content-Type", "")

        if not message_id or not ticket:
            # Skip malformed parts
            continue

        try:
            delivery_count = int(delivery_count_raw)
        except ValueError:
            delivery_count = 0

        payload: Any = payload_bytes
        if "application/json" in content_type.lower():
            try:
                payload = json.loads(payload_bytes.decode("utf-8"))
            except Exception as exc:  # noqa: BLE001
                raise MessageCorruptedError(
                    str(message_id),
                    f"Failed to parse payload as JSON: {exc}",
                ) from exc

        messages.append(
            {
                "messageId": str(message_id),
                "deliveryCount": delivery_count,
                "createdAt": str(timestamp),
                "ticket": str(ticket),
                "contentType": str(content_type),
                "payload": payload,
            }
        )

    return messages


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

      GET {base_url}{base_path}/{messageId}
      Accept: multipart/mixed

    Returns (payload, delivery_count, created_at, ticket).
    """
    base_url = _client.get_queue_base_url().rstrip("/")  # type: ignore[attr-defined]
    base_path = _client.get_queue_base_path()  # type: ignore[attr-defined]
    auth_token = _client.get_queue_token(None)  # type: ignore[attr-defined]

    headers: dict[str, str] = {
        "Authorization": f"Bearer {auth_token}",
        "Vqs-Queue-Name": queue_name,
        "Vqs-Consumer-Group": consumer_group,
        "Accept": "multipart/mixed",
    }

    if visibility_timeout_seconds is not None:
        headers["Vqs-Visibility-Timeout"] = str(int(visibility_timeout_seconds))

    url = f"{base_url}{base_path}/{quote(message_id, safe='')}"
    with httpx.Client(timeout=timeout) as client:
        response = client.get(url, headers=headers)

    if response.status_code == 400:
        raise BadRequestError(response.text or "Invalid parameters")
    if response.status_code == 401:
        raise UnauthorizedError()
    if response.status_code == 403:
        raise ForbiddenError()
    if response.status_code == 404:
        raise MessageNotFoundError(message_id)
    if response.status_code == 423:
        raise MessageLockedError(message_id, parse_retry_after(response))
    if response.status_code == 409:
        raise MessageNotAvailableError(message_id)
    if response.status_code >= 500:
        raise InternalServerError(
            response.text or f"Server error: {response.status_code} {response.reason_phrase}"
        )

    response.raise_for_status()

    try:
        part_headers, payload_bytes = parse_multipart_message(response)
    except Exception as exc:
        raise MessageCorruptedError(
            message_id,
            f"Failed to parse multipart response: {exc}",
        ) from exc
    delivery_count_raw = part_headers.get("Vqs-Delivery-Count") or "0"
    timestamp = part_headers.get("Vqs-Timestamp") or ""
    ticket = part_headers.get("Vqs-Ticket")

    if not ticket:
        raise MessageCorruptedError(
            message_id,
            "Missing required queue header 'Vqs-Ticket' in multipart response",
        )

    try:
        delivery_count = int(delivery_count_raw)
    except ValueError:
        delivery_count = 0

    content_type = part_headers.get("Content-Type", "")
    if "application/json" in content_type.lower():
        try:
            payload: Any = json.loads(payload_bytes.decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            raise MessageCorruptedError(
                message_id,
                f"Failed to parse payload as JSON: {exc}",
            ) from exc
    return payload, delivery_count, timestamp, ticket  # type: ignore[return-value]


def delete_message(
    queue_name: str,
    consumer_group: str,
    message_id: str,
    ticket: str,
    *,
    timeout: float | None = 10.0,
) -> None:
    base_url = _client.get_queue_base_url().rstrip("/")  # type: ignore[attr-defined]
    base_path = _client.get_queue_base_path()  # type: ignore[attr-defined]
    auth_token = _client.get_queue_token(None)  # type: ignore[attr-defined]

    headers: dict[str, str] = {
        "Authorization": f"Bearer {auth_token}",
        "Vqs-Queue-Name": queue_name,
        "Vqs-Consumer-Group": consumer_group,
        "Vqs-Ticket": ticket,
    }

    url = f"{base_url}{base_path}/{quote(message_id, safe='')}"
    with httpx.Client(timeout=timeout) as client:
        response = client.delete(url, headers=headers)

    if response.status_code == 400:
        raise BadRequestError("Missing or invalid ticket")
    if response.status_code == 401:
        raise UnauthorizedError()
    if response.status_code == 403:
        raise ForbiddenError()
    if response.status_code == 404:
        raise MessageNotFoundError(message_id)
    if response.status_code == 409:
        raise MessageNotAvailableError(message_id, "not available for deletion")
    if response.status_code >= 500:
        raise InternalServerError(
            response.text or f"Server error: {response.status_code} {response.reason_phrase}"
        )

    response.raise_for_status()


def change_visibility(
    queue_name: str,
    consumer_group: str,
    message_id: str,
    ticket: str,
    visibility_timeout_seconds: int,
    *,
    timeout: float | None = 10.0,
) -> None:
    base_url = _client.get_queue_base_url().rstrip("/")  # type: ignore[attr-defined]
    base_path = _client.get_queue_base_path()  # type: ignore[attr-defined]
    auth_token = _client.get_queue_token(None)  # type: ignore[attr-defined]

    headers: dict[str, str] = {
        "Authorization": f"Bearer {auth_token}",
        "Vqs-Queue-Name": queue_name,
        "Vqs-Consumer-Group": consumer_group,
        "Vqs-Ticket": ticket,
        "Vqs-Visibility-Timeout": str(visibility_timeout_seconds),
    }

    url = f"{base_url}{base_path}/{quote(message_id, safe='')}"
    with httpx.Client(timeout=timeout) as client:
        response = client.patch(url, headers=headers)

    if response.status_code == 400:
        raise BadRequestError("Missing ticket or invalid visibility timeout")
    if response.status_code == 401:
        raise UnauthorizedError()
    if response.status_code == 403:
        raise ForbiddenError()
    if response.status_code == 404:
        raise MessageNotFoundError(message_id)
    if response.status_code == 409:
        raise MessageNotAvailableError(message_id, "not available for visibility change")
    if response.status_code >= 500:
        raise InternalServerError(
            response.text or f"Server error: {response.status_code} {response.reason_phrase}"
        )

    response.raise_for_status()


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
        ticket: str,
        *,
        visibility_timeout_seconds: int,
        refresh_interval_seconds: float,
        timeout: float | None = 10.0,
        debug: bool = False,
    ) -> None:
        self.queue_name = queue_name
        self.consumer_group = consumer_group
        self.message_id = message_id
        self.ticket = ticket
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
                        self.ticket,
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
