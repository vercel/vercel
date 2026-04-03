from __future__ import annotations

import json
from collections.abc import Callable
from datetime import date, datetime
from decimal import Decimal
from typing import Any, TypedDict
from uuid import UUID

BaseUrlResolver = Callable[[str], str]


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


__all__ = [
    "BaseUrlResolver",
    "MessageMetadata",
    "ReceivedMessage",
    "SendMessageResult",
    "WorkerJSONEncoder",
    "WorkerTimeoutResult",
]
