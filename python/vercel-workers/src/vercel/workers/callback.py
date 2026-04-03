from __future__ import annotations

import json
import threading
from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, TypedDict, Union

from .exceptions import MessageCorruptedError, VQSError
from .types import MessageMetadata, ReceivedMessage, WorkerTimeoutResult
from .wsgi import json_response, status_reason

if TYPE_CHECKING:
    from .client import QueueClient


CLOUD_EVENT_TYPE_V2BETA = "com.vercel.queue.v2beta"


class ParsedCallback(TypedDict, total=False):
    queueName: str
    consumerGroup: str
    messageId: str
    region: str
    receiptHandle: str
    deliveryCount: int
    createdAt: str
    expiresAt: str | None
    contentType: str
    visibilityDeadline: str | None
    rawBody: bytes


class RetryDirective(TypedDict, total=False):
    timeoutSeconds: int
    acknowledge: bool


MessageHandler = Callable[[Any, "MessageMetadata"], Any]
RetryHandler = Callable[
    [BaseException, "MessageMetadata"],
    Union[RetryDirective, "WorkerTimeoutResult", None],
]


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _normalize_headers(headers: Mapping[str, str]) -> dict[str, str]:
    return {str(name).lower(): str(value) for name, value in headers.items()}


def _parse_int(value: str | None, *, default: int) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _deserialize_payload(raw_body: bytes, content_type: str) -> Any:
    if "application/json" not in content_type.lower():
        return raw_body
    try:
        return json.loads(raw_body.decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise MessageCorruptedError("callback", f"Failed to parse inline JSON payload: {exc}") from exc


def _extract_timeout_seconds(result: Any) -> int | None:
    if not isinstance(result, dict) or "timeoutSeconds" not in result:
        return None
    try:
        return int(result["timeoutSeconds"])
    except (TypeError, ValueError):
        return None


def _should_acknowledge(result: Any) -> bool:
    return isinstance(result, dict) and bool(result.get("acknowledge"))


def _response_payload(
    metadata: "MessageMetadata",
    *,
    delayed: bool = False,
    timeout_seconds: int | None = None,
    acknowledged: bool = False,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "ok": True,
        "queue": metadata["topicName"],
        "consumer": metadata["consumerGroup"],
        "messageId": metadata["messageId"],
        "deliveryCount": metadata["deliveryCount"],
        "createdAt": metadata["createdAt"],
    }
    if metadata.get("expiresAt") is not None:
        payload["expiresAt"] = metadata["expiresAt"]
    if delayed:
        payload["delayed"] = True
    if timeout_seconds is not None:
        payload["timeoutSeconds"] = int(timeout_seconds)
    if acknowledged:
        payload["acknowledged"] = True
    return payload


def parse_callback(body: bytes, headers: Mapping[str, str]) -> ParsedCallback:
    normalized = _normalize_headers(headers)
    ce_type = normalized.get("ce-type")
    if ce_type != CLOUD_EVENT_TYPE_V2BETA:
        raise ValueError(
            f"Invalid CloudEvent type: expected '{CLOUD_EVENT_TYPE_V2BETA}', got {ce_type!r}"
        )

    queue_name = normalized.get("ce-vqsqueuename")
    consumer_group = normalized.get("ce-vqsconsumergroup")
    message_id = normalized.get("ce-vqsmessageid")
    missing: list[str] = []
    if not queue_name:
        missing.append("ce-vqsqueuename")
    if not consumer_group:
        missing.append("ce-vqsconsumergroup")
    if not message_id:
        missing.append("ce-vqsmessageid")
    if missing:
        raise ValueError(f"Missing required CloudEvent headers: {', '.join(missing)}")

    parsed: ParsedCallback = {
        "queueName": queue_name,
        "consumerGroup": consumer_group,
        "messageId": message_id,
    }

    region = normalized.get("ce-vqsregion")
    if region:
        parsed["region"] = region

    receipt_handle = normalized.get("ce-vqsreceipthandle")
    if not receipt_handle:
        return parsed

    parsed["receiptHandle"] = receipt_handle
    parsed["deliveryCount"] = _parse_int(normalized.get("ce-vqsdeliverycount"), default=1)
    parsed["createdAt"] = normalized.get("ce-vqscreatedat") or _now_iso()
    parsed["expiresAt"] = normalized.get("ce-vqsexpiresat")
    parsed["contentType"] = normalized.get("content-type") or "application/octet-stream"
    parsed["visibilityDeadline"] = normalized.get("ce-vqsvisibilitydeadline")
    parsed["rawBody"] = body
    return parsed


class VisibilityExtender:
    """Extend a lease periodically while a synchronous handler is running."""

    def __init__(
        self,
        client: "QueueClient",
        queue_name: str,
        consumer_group: str,
        receipt_handle: str,
        *,
        visibility_timeout_seconds: int,
        refresh_interval_seconds: float,
        debug: bool = False,
    ) -> None:
        self.client = client
        self.queue_name = queue_name
        self.consumer_group = consumer_group
        self.receipt_handle = receipt_handle
        self.visibility_timeout_seconds = int(visibility_timeout_seconds)
        self.refresh_interval_seconds = float(refresh_interval_seconds)
        self.debug = debug
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self.refresh_interval_seconds <= 0:
            return
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def finalize(self, fn: Callable[[], None]) -> None:
        self._stop.set()
        with self._lock:
            fn()

    def _run(self) -> None:
        while True:
            if self._stop.wait(self.refresh_interval_seconds):
                return
            with self._lock:
                if self._stop.is_set():
                    return
                try:
                    self.client.change_visibility(
                        self.queue_name,
                        self.consumer_group,
                        self.receipt_handle,
                        self.visibility_timeout_seconds,
                    )
                except Exception as exc:  # noqa: BLE001
                    if self.debug:
                        print(
                            "[vercelqueue] visibility extension failed",
                            {
                                "queue": self.queue_name,
                                "consumer": self.consumer_group,
                                "receiptHandle": self.receipt_handle,
                                "error": repr(exc),
                            },
                        )
                    return


def _finalize_visibility(extender: VisibilityExtender | None, fn: Callable[[], None]) -> None:
    if extender is not None:
        extender.finalize(fn)
    else:
        fn()


def _inline_message(parsed: ParsedCallback) -> "ReceivedMessage":
    content_type = parsed.get("contentType") or "application/octet-stream"
    raw_body = parsed.get("rawBody")
    if raw_body is None:
        raise ValueError("Binary mode callback with receipt handle is missing payload")
    return {
        "messageId": parsed["messageId"],
        "deliveryCount": parsed.get("deliveryCount", 1),
        "createdAt": parsed.get("createdAt") or _now_iso(),
        "expiresAt": parsed.get("expiresAt"),
        "contentType": content_type,
        "receiptHandle": parsed["receiptHandle"],
        "payload": _deserialize_payload(raw_body, content_type),
    }


def _message_metadata(
    parsed: ParsedCallback,
    message: "ReceivedMessage",
    *,
    region: str,
) -> "MessageMetadata":
    return {
        "messageId": message["messageId"],
        "deliveryCount": message["deliveryCount"],
        "createdAt": message["createdAt"],
        "expiresAt": message.get("expiresAt"),
        "topicName": parsed["queueName"],
        "consumerGroup": parsed["consumerGroup"],
        "region": region,
    }


def handle_parsed_callback(
    client: "QueueClient",
    parsed: ParsedCallback,
    handler: MessageHandler,
    *,
    visibility_timeout_seconds: int = 30,
    refresh_interval_seconds: float = 10.0,
    retry: RetryHandler | None = None,
) -> tuple[int, list[tuple[str, str]], bytes]:
    queue_name = parsed["queueName"]
    consumer_group = parsed["consumerGroup"]
    active_client = client.with_region(parsed["region"]) if parsed.get("region") else client

    message: "ReceivedMessage"
    if "receiptHandle" in parsed:
        message = _inline_message(parsed)
    else:
        message = active_client.receive_by_id(
            queue_name,
            consumer_group,
            parsed["messageId"],
            visibility_timeout_seconds=visibility_timeout_seconds,
        )

    metadata = _message_metadata(parsed, message, region=active_client.region)
    extender = VisibilityExtender(
        active_client,
        queue_name,
        consumer_group,
        message["receiptHandle"],
        visibility_timeout_seconds=visibility_timeout_seconds,
        refresh_interval_seconds=refresh_interval_seconds,
    )
    extender.start()

    try:
        result = handler(message["payload"], metadata)
        if _should_acknowledge(result):
            _finalize_visibility(
                extender,
                lambda: active_client.acknowledge(
                    queue_name,
                    consumer_group,
                    message["receiptHandle"],
                ),
            )
            return json_response(200, _response_payload(metadata, acknowledged=True))

        timeout_seconds = _extract_timeout_seconds(result)
        if timeout_seconds is not None:
            _finalize_visibility(
                extender,
                lambda: active_client.change_visibility(
                    queue_name,
                    consumer_group,
                    message["receiptHandle"],
                    timeout_seconds,
                ),
            )
            return json_response(
                200,
                _response_payload(metadata, delayed=True, timeout_seconds=timeout_seconds),
            )

        _finalize_visibility(
            extender,
            lambda: active_client.acknowledge(
                queue_name,
                consumer_group,
                message["receiptHandle"],
            ),
        )
        return json_response(200, _response_payload(metadata))
    except Exception as exc:
        directive: RetryDirective | WorkerTimeoutResult | None = None
        if retry is not None:
            try:
                directive = retry(exc, metadata)
            except Exception as retry_exc:  # noqa: BLE001
                print("Queue retry handler threw:", repr(retry_exc))

        if isinstance(directive, dict) and directive.get("acknowledge"):
            _finalize_visibility(
                extender,
                lambda: active_client.acknowledge(
                    queue_name,
                    consumer_group,
                    message["receiptHandle"],
                ),
            )
            return json_response(200, _response_payload(metadata, acknowledged=True))

        timeout_seconds = _extract_timeout_seconds(directive)
        if timeout_seconds is not None:
            _finalize_visibility(
                extender,
                lambda: active_client.change_visibility(
                    queue_name,
                    consumer_group,
                    message["receiptHandle"],
                    timeout_seconds,
                ),
            )
            return json_response(
                200,
                _response_payload(metadata, delayed=True, timeout_seconds=timeout_seconds),
            )
        raise
    finally:
        extender.stop()


def handle_callback(
    client: "QueueClient",
    raw_body: bytes,
    headers: Mapping[str, str],
    handler: MessageHandler,
    *,
    visibility_timeout_seconds: int = 30,
    refresh_interval_seconds: float = 10.0,
    retry: RetryHandler | None = None,
    context: str = "vercel.workers.handle_queue_callback",
) -> tuple[int, list[tuple[str, str]], bytes]:
    try:
        parsed = parse_callback(raw_body, headers)
        return handle_parsed_callback(
            client,
            parsed,
            handler,
            visibility_timeout_seconds=visibility_timeout_seconds,
            refresh_interval_seconds=refresh_interval_seconds,
            retry=retry,
        )
    except ValueError as exc:
        return json_response(400, {"error": str(exc), "type": exc.__class__.__name__})
    except VQSError as exc:
        status_code = getattr(exc, "status_code", None) or 500
        payload: dict[str, Any] = {"error": str(exc), "type": exc.__class__.__name__}
        retry_after = getattr(exc, "retry_after", None)
        if isinstance(retry_after, int):
            payload["retryAfter"] = retry_after
        print(f"{context} error ({int(status_code)} {status_reason(int(status_code))}):", repr(exc))
        return json_response(int(status_code), payload)
    except Exception as exc:  # noqa: BLE001
        print(f"{context} error:", repr(exc))
        return json_response(500, {"error": "internal"})
