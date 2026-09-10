from __future__ import annotations

from datetime import UTC, datetime, timedelta

__all__ = [
    "as_utc",
    "canonical_scheduled_logical_time",
    "earliest",
    "require_aware_datetime",
]


def require_aware_datetime(value: datetime, *, name: str) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{name} must be timezone-aware")
    return value


def as_utc(value: datetime, *, name: str = "value") -> datetime:
    # Normalize every logical scheduler timestamp to UTC so comparisons and idempotency keys use
    # one canonical representation. For example, "2026-04-09T08:00:00-04:00" and
    # "2026-04-09T12:00:00+00:00" are the same wakeup and should collapse to the same value.
    return require_aware_datetime(value, name=name).astimezone(UTC)


def earliest(current: datetime | None, candidate: datetime | None) -> datetime | None:
    if candidate is None:
        return current
    if current is None or candidate < current:
        return candidate
    return current


def canonical_scheduled_logical_time(
    logical_time: datetime,
    *,
    now: datetime,
    max_delay_seconds: int,
) -> datetime:
    # Vercel Queues can only delay a message up to max_delay_seconds, so far-future wakeups need
    # one or more bridge messages. The bridge must be stable across repeated seed() calls before it
    # fires, otherwise every cold start can mint a new idempotency key and a parallel bridge chain.
    #
    # Example with max_delay=7d and final target=2026-05-10T12:00:00Z:
    # - seed() at 2026-04-10T12:00:00Z -> publish 2026-04-12T12:00:00Z
    # - seed() again at 2026-04-11T12:00:00Z -> still publish 2026-04-12T12:00:00Z
    # - when that bridge fires on 2026-04-12T12:00:00Z -> the next bridge becomes
    #   2026-04-19T12:00:00Z
    logical_time_utc = as_utc(logical_time)
    now_utc = as_utc(now, name="now")
    max_delay = timedelta(seconds=max_delay_seconds)
    latest_publish_time = now_utc + max_delay
    if logical_time_utc <= latest_publish_time:
        return logical_time_utc

    # Ceiling-divide the remaining distance into max-delay hops, then choose the first hop after
    # "now" by walking backward from the final target. That keeps every pre-bridge publish on the
    # same deterministic chain anchored by the final logical time.
    remaining_hops, remainder = divmod(logical_time_utc - now_utc, max_delay)
    if remainder != timedelta(0):
        remaining_hops += 1

    bridge_hops = int(remaining_hops) - 1
    return logical_time_utc - bridge_hops * max_delay
