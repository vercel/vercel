from __future__ import annotations

from .client import (
    AsyncQueueClient,
    QueueClient,
    send,
    send_async,
)
from .exceptions import (
    BadRequestError,
    DuplicateIdempotencyKeyError,
    ForbiddenError,
    InternalServerError,
    InvalidLimitError,
    MessageAlreadyProcessedError,
    MessageCorruptedError,
    MessageLockedError,
    MessageNotAvailableError,
    MessageNotFoundError,
    QueueEmptyError,
    ThrottledError,
    TokenResolutionError,
    UnauthorizedError,
    VQSError,
)
from .subscriptions import get_asgi_app, get_wsgi_app, has_subscriptions, subscribe
from .types import (
    MessageMetadata,
    ReceivedMessage,
    SendMessageResult,
    WorkerJSONEncoder,
    WorkerTimeoutResult,
)

__all__ = [
    "QueueClient",
    "AsyncQueueClient",
    "MessageMetadata",
    "ReceivedMessage",
    "SendMessageResult",
    "WorkerJSONEncoder",
    "WorkerTimeoutResult",
    "subscribe",
    "get_wsgi_app",
    "get_asgi_app",
    "has_subscriptions",
    "send",
    "send_async",
    # exceptions
    "VQSError",
    "BadRequestError",
    "UnauthorizedError",
    "ForbiddenError",
    "InternalServerError",
    "TokenResolutionError",
    "ThrottledError",
    "DuplicateIdempotencyKeyError",
    "InvalidLimitError",
    "QueueEmptyError",
    "MessageNotFoundError",
    "MessageNotAvailableError",
    "MessageAlreadyProcessedError",
    "MessageCorruptedError",
    "MessageLockedError",
]
