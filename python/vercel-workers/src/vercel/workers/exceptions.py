from __future__ import annotations

from typing import Final

__all__ = [
    "VQSError",
    "BadRequestError",
    "UnauthorizedError",
    "ForbiddenError",
    "InternalServerError",
    "TokenResolutionError",
    "DuplicateIdempotencyKeyError",
    "InvalidLimitError",
    "QueueEmptyError",
    "MessageNotFoundError",
    "MessageNotAvailableError",
    "MessageCorruptedError",
    "MessageLockedError",
    "ThrottledError",
]


class VQSError(Exception):
    """Base exception for all Vercel Queue errors."""

    status_code: int | None = None


class BadRequestError(VQSError, ValueError):
    """400 - Invalid parameters or malformed request."""

    status_code = 400
    default_message: Final[str] = "Invalid parameters"

    def __init__(self, message: str | None = None) -> None:
        super().__init__(message or self.default_message)


class UnauthorizedError(VQSError, PermissionError):
    """401 - Missing or invalid authentication token."""

    status_code = 401
    default_message: Final[str] = "Missing or invalid authentication token"

    def __init__(self, message: str | None = None) -> None:
        super().__init__(message or self.default_message)


class ForbiddenError(VQSError, PermissionError):
    """403 - Access forbidden (usually environment mismatch)."""

    status_code = 403
    default_message: Final[str] = "Queue environment does not match token environment"

    def __init__(self, message: str | None = None) -> None:
        super().__init__(message or self.default_message)


class InternalServerError(VQSError, RuntimeError):
    """5xx - Server-side error."""

    status_code = 500
    default_message: Final[str] = "Unexpected server error"

    def __init__(self, message: str | None = None) -> None:
        super().__init__(message or self.default_message)


class TokenResolutionError(VQSError, RuntimeError):
    """Raised when we cannot resolve a queue token locally (env/OIDC)."""

    status_code = 500


class DuplicateIdempotencyKeyError(VQSError, RuntimeError):
    """409 - Duplicate idempotency key detected when sending."""

    status_code = 409


class InvalidLimitError(VQSError, ValueError):
    """Raised when limit is outside the allowed range (typically 1..10)."""

    status_code = 400

    def __init__(self, limit: int, min: int = 1, max: int = 10) -> None:  # noqa: A002
        self.limit = int(limit)
        self.min = int(min)
        self.max = int(max)
        super().__init__(
            f"Invalid limit: {self.limit}. Limit must be between {self.min} and {self.max}.",
        )


class QueueEmptyError(VQSError):
    """204 - No messages available in the queue for the consumer group."""

    status_code = 204

    def __init__(self, queue_name: str, consumer_group: str) -> None:
        self.queue_name = str(queue_name)
        self.consumer_group = str(consumer_group)
        super().__init__(
            f'No messages available in queue "{self.queue_name}" '
            f'for consumer group "{self.consumer_group}"',
        )


class MessageNotFoundError(VQSError, LookupError):
    """404 - Message not found."""

    status_code = 404

    def __init__(self, message_id: str) -> None:
        self.message_id = str(message_id)
        super().__init__(f"Message {self.message_id} not found")


class MessageNotAvailableError(VQSError, RuntimeError):
    """409 - Message exists but is not available for processing (wrong state/claimed/etc)."""

    status_code = 409

    def __init__(self, message_id: str, reason: str | None = None) -> None:
        self.message_id = str(message_id)
        self.reason = str(reason) if reason else None
        suffix = f": {self.reason}" if self.reason else ""
        super().__init__(f"Message {self.message_id} not available for processing{suffix}")


class MessageCorruptedError(VQSError, RuntimeError):
    """Raised when message data is corrupted or can't be parsed."""

    status_code = 500

    def __init__(self, message_id: str, reason: str) -> None:
        self.message_id = str(message_id)
        self.reason = str(reason)
        super().__init__(f"Message {self.message_id} is corrupted: {self.reason}")


class MessageLockedError(VQSError, RuntimeError):
    """423 - Message is temporarily locked (retry later)."""

    status_code = 423

    def __init__(self, message_id: str, retry_after: int | None = None) -> None:
        self.message_id = str(message_id)
        self.retry_after = int(retry_after) if retry_after is not None else None
        retry_msg = (
            f" Retry after {self.retry_after} seconds."
            if self.retry_after is not None
            else " Try again later."
        )
        super().__init__(f"Message {self.message_id} is temporarily locked.{retry_msg}")


class ThrottledError(VQSError, RuntimeError):
    """429 - Throttled by the queue service (retry later)."""

    status_code = 429

    def __init__(self, retry_after: int | None = None) -> None:
        self.retry_after = int(retry_after) if retry_after is not None else None
        super().__init__(
            "Throttled by queue service"
            + (f", Retry-After={self.retry_after}" if self.retry_after is not None else "")
        )
