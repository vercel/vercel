from __future__ import annotations

import re
from contextvars import ContextVar, Token
from datetime import UTC, datetime

INTERNAL_DEADLINE_HEADER = "x-vercel-internal-deadline"
_RFC3339_PATTERN = re.compile(
    r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}"
    r"(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})"
)

_deadline: ContextVar[datetime | None] = ContextVar(
    "vercel_deadline",
    default=None,
)


def get_deadline() -> datetime | None:
    """Return the current invocation deadline in UTC, if provided."""
    return _deadline.get()


def set_deadline(value: str | None) -> Token[datetime | None]:
    parsed: datetime | None = None
    if value is not None and _RFC3339_PATTERN.fullmatch(value):
        try:
            candidate = datetime.fromisoformat(value)
            if candidate.tzinfo is not None:
                utc_candidate = candidate.astimezone(UTC)
                parsed = utc_candidate.replace(
                    microsecond=utc_candidate.microsecond // 1000 * 1000
                )
        except (TypeError, ValueError):
            pass
    return _deadline.set(parsed)


def reset_deadline(token: Token[datetime | None]) -> None:
    """Reset the deadline; must run in the context that created the token."""
    try:
        _deadline.reset(token)
    except ValueError:
        # Defensive: a copied context cannot restore the token, so fall back
        # to clearing the deadline in the current context.
        _deadline.set(None)


def pop_deadline_header(headers: dict[str, str]) -> str | None:
    value: str | None = None
    for key in tuple(headers):
        if key.lower() == INTERNAL_DEADLINE_HEADER:
            current = headers.pop(key)
            if value is None:
                value = current
    return value
