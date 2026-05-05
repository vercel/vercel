from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, TypedDict, TypeGuard
from uuid import UUID


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


type Duration = int | float | timedelta


def is_duration(value: object) -> TypeGuard[Duration]:
    return isinstance(value, (int, float, timedelta)) and not isinstance(value, bool)


class SendMessageResult(TypedDict):
    """Result of sending a message to the queue.

    ``messageId`` is ``None`` when the server returns 202 (deferred delivery).
    """

    messageId: str | None


class MessageMetadata(TypedDict, total=False):
    """Metadata describing a queue message delivery."""

    messageId: str
    deliveryCount: int
    createdAt: str
    topic: str
    consumer: str


class ReceivedMessage(TypedDict):
    messageId: str
    deliveryCount: int
    createdAt: str
    receipt_handle: str
    contentType: str
    payload: Any


class ParsedV2BetaCallback(TypedDict):
    queueName: str
    consumerGroup: str
    messageId: str
    receiptHandle: str
    deliveryCount: int
    createdAt: str
    payload: Any


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


class _DeploymentIdUnset:
    pass


DEPLOYMENT_ID_UNSET = _DeploymentIdUnset()
type DeploymentIdOption = str | None | _DeploymentIdUnset


__all__ = [
    "DEPLOYMENT_ID_UNSET",
    "CloudEvent",
    "CloudEventData",
    "DeploymentIdOption",
    "Duration",
    "MessageMetadata",
    "ParsedV2BetaCallback",
    "ReceivedMessage",
    "SendMessageResult",
    "WorkerJSONEncoder",
    "is_duration",
]
