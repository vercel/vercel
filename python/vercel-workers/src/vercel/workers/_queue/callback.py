from __future__ import annotations

import json
from typing import Any

from vercel.workers._queue.types import (
    CloudEvent,
    CloudEventData,
    ParsedV2BetaCallback,
)

CLOUD_EVENT_TYPE_V2BETA = "com.vercel.queue.v2beta"


def _get_environ_header(environ: dict[str, Any], name: str, default: str = "") -> str:
    # WSGI (PEP 3333) stores most HTTP headers with an HTTP_ prefix, but
    # Content-Type and Content-Length are special: they are stored without the
    # prefix as CONTENT_TYPE and CONTENT_LENGTH respectively.
    key = "HTTP_" + name.upper().replace("-", "_")
    value = environ.get(key)
    if value is None:
        # Fall back to the non-prefixed key for Content-Type / Content-Length
        wsgi_key = name.upper().replace("-", "_")
        value = environ.get(wsgi_key)
    if value is None:
        return default
    if isinstance(value, bytes):
        return value.decode("latin1")
    return str(value)


def is_v2beta_callback(environ: dict[str, Any]) -> bool:
    return _get_environ_header(environ, "Ce-Type") == CLOUD_EVENT_TYPE_V2BETA


def parse_v2beta_callback(
    raw_body: bytes,
    environ: dict[str, Any],
) -> ParsedV2BetaCallback:
    """Parse a v2beta binary content mode callback."""
    queue_name = _get_environ_header(environ, "Ce-Vqsqueuename")
    consumer_group = _get_environ_header(environ, "Ce-Vqsconsumergroup")
    message_id = _get_environ_header(environ, "Ce-Vqsmessageid")
    receipt_handle = _get_environ_header(environ, "Ce-Vqsreceipthandle")

    if not queue_name or not consumer_group or not message_id:
        raise ValueError("missing required ce-vqs* headers")

    delivery_count_raw = _get_environ_header(environ, "Ce-Vqsdeliverycount", "1")
    try:
        delivery_count = int(delivery_count_raw)
    except ValueError:
        delivery_count = 1

    created_at = _get_environ_header(environ, "Ce-Vqscreatedat")

    content_type = _get_environ_header(environ, "Content-Type")
    payload: Any
    if "application/json" in content_type.lower():
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except Exception:  # noqa: BLE001
            payload = raw_body
    else:
        payload = raw_body

    return {
        "queueName": queue_name,
        "consumerGroup": consumer_group,
        "messageId": message_id,
        "receiptHandle": receipt_handle,
        "deliveryCount": delivery_count,
        "createdAt": created_at,
        "payload": payload,
    }


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


__all__ = [
    "CLOUD_EVENT_TYPE_V2BETA",
    "CloudEvent",
    "CloudEventData",
    "ParsedV2BetaCallback",
    "is_v2beta_callback",
    "parse_cloudevent",
    "parse_v2beta_callback",
]
