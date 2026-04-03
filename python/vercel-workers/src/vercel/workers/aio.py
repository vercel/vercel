from __future__ import annotations

from .client import AsyncQueueClient, send_async as send
from .types import MessageMetadata, ReceivedMessage, SendMessageResult, WorkerTimeoutResult

QueueClient = AsyncQueueClient

__all__ = [
    "QueueClient",
    "AsyncQueueClient",
    "MessageMetadata",
    "ReceivedMessage",
    "SendMessageResult",
    "WorkerTimeoutResult",
    "send",
]
