from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from vercel.workers.apscheduler.scheduler import (
    PublishedWakeup,
    VercelQueueScheduler,
    WakeupPayload,
)

from .. import callback as queue_callback
from ..asgi import build_asgi_app
from ..exceptions import VQSError
from ..wsgi import build_wsgi_app, status_reason

ASGI = Callable[
    [
        dict[str, Any],
        Callable[[], Awaitable[dict[str, Any]]],
        Callable[[dict[str, Any]], Awaitable[None]],
    ],
    Awaitable[None],
]
WSGI = Callable[[dict[str, Any], Callable[..., Any]], list[bytes]]
SchedulerFactory = Callable[[], VercelQueueScheduler]
SchedulerTarget = VercelQueueScheduler | SchedulerFactory

__all__ = [
    "APSchedulerWorkerConfig",
    "get_asgi_app",
    "get_wsgi_app",
    "handle_queue_callback",
    "seed_next_wakeup",
]

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class APSchedulerWorkerConfig:
    visibility_timeout_seconds: int = 30
    visibility_refresh_interval_seconds: float = 10.0
    timeout: float | None = 10.0


def _json_response(
    payload: dict[str, Any],
    *,
    status_code: int,
) -> tuple[int, list[tuple[str, str]], bytes]:
    body = json.dumps(payload).encode("utf-8")
    return (
        status_code,
        [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
        body,
    )


def seed_next_wakeup(
    scheduler_factory: SchedulerFactory,
    *,
    now: datetime | None = None,
) -> PublishedWakeup | None:
    scheduler = scheduler_factory()
    try:
        return scheduler.seed(now=now)
    finally:
        scheduler.shutdown(wait=True)


def get_wsgi_app(
    scheduler_target: SchedulerTarget,
    *,
    config: APSchedulerWorkerConfig | None = None,
) -> WSGI:
    cfg = config or APSchedulerWorkerConfig()
    return build_wsgi_app(
        lambda raw_body: handle_queue_callback(scheduler_target, raw_body, config=cfg),
    )


def get_asgi_app(
    scheduler_target: SchedulerTarget,
    *,
    config: APSchedulerWorkerConfig | None = None,
) -> ASGI:
    cfg = config or APSchedulerWorkerConfig()
    return build_asgi_app(
        lambda raw_body: handle_queue_callback(scheduler_target, raw_body, config=cfg),
    )


def _published_wakeup_payload(published: PublishedWakeup | None) -> dict[str, Any] | None:
    if published is None:
        return None

    return {
        "logicalTime": published.logical_time.isoformat(),
        "delaySeconds": published.delay_seconds,
        "idempotencyKey": published.idempotency_key,
        "messageId": published.message_id,
    }


def _resolve_scheduler(
    scheduler_target: SchedulerTarget,
) -> tuple[VercelQueueScheduler, bool]:
    if isinstance(scheduler_target, VercelQueueScheduler):
        return scheduler_target, False
    return scheduler_target(), True


def _acknowledge_message(
    queue_name: str,
    consumer_group: str,
    message_id: str,
    receipt_handle: str,
    *,
    timeout: float | None,
    extender: queue_callback.VisibilityExtender | None,
) -> None:
    def delete_message() -> None:
        queue_callback.delete_message(
            queue_name,
            consumer_group,
            message_id,
            receipt_handle,
            timeout=timeout,
        )

    if extender is not None:
        extender.finalize(delete_message)
        return

    delete_message()


def _ignored_wakeup_response(
    *,
    queue_name: str,
    consumer_group: str,
    message_id: str,
    delivery_count: int,
    created_at: str,
    reason: str,
) -> tuple[int, list[tuple[str, str]], bytes]:
    return _json_response(
        {
            "ok": True,
            "ignored": True,
            "queue": queue_name,
            "consumer": consumer_group,
            "messageId": message_id,
            "deliveryCount": delivery_count,
            "createdAt": created_at,
            "ignoredReason": reason,
        },
        status_code=200,
    )


def handle_queue_callback(
    scheduler_target: SchedulerTarget,
    raw_body: bytes,
    *,
    config: APSchedulerWorkerConfig | None = None,
) -> tuple[int, list[tuple[str, str]], bytes]:
    cfg = config or APSchedulerWorkerConfig()
    extender: queue_callback.VisibilityExtender | None = None
    scheduler: VercelQueueScheduler | None = None
    shutdown_scheduler = False

    try:
        queue_name, consumer_group, message_id = queue_callback.parse_cloudevent(raw_body)
        payload, delivery_count, created_at, receipt_handle = queue_callback.receive_message_by_id(
            queue_name,
            consumer_group,
            message_id,
            visibility_timeout_seconds=cfg.visibility_timeout_seconds,
            timeout=cfg.timeout,
        )

        if receipt_handle:
            extender = queue_callback.VisibilityExtender(
                queue_name,
                consumer_group,
                message_id,
                receipt_handle,
                visibility_timeout_seconds=cfg.visibility_timeout_seconds,
                refresh_interval_seconds=cfg.visibility_refresh_interval_seconds,
                timeout=cfg.timeout,
            )
            extender.start()

        try:
            wakeup = WakeupPayload.from_payload(payload)
        except ValueError as exc:
            if receipt_handle:
                _acknowledge_message(
                    queue_name,
                    consumer_group,
                    message_id,
                    receipt_handle,
                    timeout=cfg.timeout,
                    extender=extender,
                )
            logger.warning(
                'Ignoring APScheduler wakeup message "%s" from "%s"/"%s": %s',
                message_id,
                queue_name,
                consumer_group,
                exc,
            )
            return _ignored_wakeup_response(
                queue_name=queue_name,
                consumer_group=consumer_group,
                message_id=message_id,
                delivery_count=delivery_count,
                created_at=created_at,
                reason=str(exc),
            )

        created_scheduler, shutdown_scheduler = _resolve_scheduler(scheduler_target)
        scheduler = created_scheduler
        if wakeup.scheduler_id != created_scheduler.options.scheduler_id:
            reason = (
                "Wakeup payload targeted scheduler "
                f"{wakeup.scheduler_id!r}, expected {created_scheduler.options.scheduler_id!r}"
            )
            if receipt_handle:
                _acknowledge_message(
                    queue_name,
                    consumer_group,
                    message_id,
                    receipt_handle,
                    timeout=cfg.timeout,
                    extender=extender,
                )
            logger.warning(
                'Ignoring APScheduler wakeup message "%s" from "%s"/"%s": %s',
                message_id,
                queue_name,
                consumer_group,
                reason,
            )
            return _ignored_wakeup_response(
                queue_name=queue_name,
                consumer_group=consumer_group,
                message_id=message_id,
                delivery_count=delivery_count,
                created_at=created_at,
                reason=reason,
            )

        result = created_scheduler.process_wakeup(wakeup.logical_time)

        if receipt_handle:
            _acknowledge_message(
                queue_name,
                consumer_group,
                message_id,
                receipt_handle,
                timeout=cfg.timeout,
                extender=extender,
            )

        return _json_response(
            {
                "ok": True,
                "queue": queue_name,
                "consumer": consumer_group,
                "messageId": message_id,
                "deliveryCount": delivery_count,
                "createdAt": created_at,
                "schedulerId": created_scheduler.options.scheduler_id,
                "logicalTime": result.logical_time.isoformat(),
                "dueJobIds": list(result.due_job_ids),
                "nextWakeupTime": (
                    result.next_wakeup_time.isoformat()
                    if result.next_wakeup_time is not None
                    else None
                ),
                "publishedWakeup": _published_wakeup_payload(result.published_wakeup),
            },
            status_code=200,
        )
    except ValueError as exc:
        return _json_response({"error": str(exc), "type": exc.__class__.__name__}, status_code=400)
    except VQSError as exc:
        status_code = getattr(exc, "status_code", None) or 500
        payload: dict[str, Any] = {"error": str(exc), "type": exc.__class__.__name__}
        retry_after = getattr(exc, "retry_after", None)
        if isinstance(retry_after, int):
            payload["retryAfter"] = retry_after
        reason = status_reason(int(status_code))
        logger.error(
            "vercel.workers.apscheduler.handle_queue_callback error (%d %s): %r",
            int(status_code),
            reason,
            exc,
        )
        return _json_response(payload, status_code=int(status_code))
    except Exception as exc:
        logger.exception("vercel.workers.apscheduler.handle_queue_callback error: %r", exc)
        return _json_response({"error": "internal"}, status_code=500)
    finally:
        if scheduler is not None and shutdown_scheduler:
            scheduler.shutdown(wait=True)
        if extender is not None:
            extender.stop()
