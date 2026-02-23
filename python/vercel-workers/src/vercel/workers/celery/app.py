from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

from .. import callback as queue_callback
from ..asgi import build_asgi_app
from ..exceptions import VQSError
from ..wsgi import build_wsgi_app, status_reason
from .transport import TransportConfig, install_kombu_transport_alias
from .utils import _execute_envelope
from .worker import PollingWorker as _PollingWorker, resolve_queue_name

try:
    from celery import Celery as CeleryApp  # type: ignore[import-untyped]
except Exception as e:
    raise RuntimeError(
        "celery is required to use vercel.workers.celery.Celery. "
        "Install it with `pip install 'vercel-workers[celery]'` or `pip install celery`.",
    ) from e

DEFAULT_BROKER_ALIAS = "vercelqueue"


ASGI = Callable[
    [
        dict[str, Any],
        Callable[[], Awaitable[dict[str, Any]]],
        Callable[[dict[str, Any]], Awaitable[None]],
    ],
    Awaitable[None],
]
WSGI = Callable[[dict[str, Any], Callable[..., Any]], list[bytes]]


class Celery(CeleryApp):
    """
    Drop-in replacement for :class:`celery.Celery` that defaults to Vercel Queues.

    Usage (same shape as Celery):
        from vercel.workers.celery import Celery
        app = Celery("myapp")  # broker defaults to vercelqueue://

    Notes:
    - If you pass an explicit broker (positional or keyword), it will be respected.
    - This installs the Kombu transport alias automatically so the broker scheme resolves.
    """

    def __init__(
        self,
        *args: Any,
        broker_alias: str = DEFAULT_BROKER_ALIAS,
        configure_defaults: bool = True,
        queue_name: str | None = None,
        **kwargs: Any,
    ) -> None:
        # Ensure the broker scheme resolves before constructing the Celery app.
        install_kombu_transport_alias(alias=broker_alias)

        args_list = list(args)
        if "broker" in kwargs:
            kwargs["broker"] = (
                broker_url(alias=broker_alias) if kwargs["broker"] is None else kwargs["broker"]
            )
        elif len(args_list) >= 2:
            args_list[1] = broker_url(alias=broker_alias) if args_list[1] is None else args_list[1]
        else:
            # No broker provided (positional or keyword): default to vercelqueue://
            kwargs["broker"] = broker_url(alias=broker_alias)

        super().__init__(*args_list, **kwargs)

        if configure_defaults:
            # Only allow JSON (avoid pickle), UTC timezone
            self.conf.update(
                task_serializer="json",
                accept_content=["json"],
                result_serializer="json",
                enable_utc=True,
                timezone="UTC",
            )

        if queue_name:
            self.conf.task_default_queue = queue_name

    def PollingWorker(
        self,
        *,
        queue_name: str | None = None,
        consumer_group: str = "default",
        limit: int = 1,
        visibility_timeout_seconds: int = 60,
        poll_interval_seconds: float = 1.0,
        on_error_visibility_timeout_seconds: int | None = None,
        timeout: float | None = 10.0,
        debug: bool = False,
        crash_on_error: bool = False,
        ack_on_error: bool = False,
    ) -> _PollingWorker:
        """
        Construct a local polling worker bound to this Celery app.

        This is intended for local development or non-serverless environments.
        """

        return _PollingWorker(
            self,
            queue_name=resolve_queue_name(self, queue_name),
            consumer_group=consumer_group,
            limit=limit,
            visibility_timeout_seconds=visibility_timeout_seconds,
            poll_interval_seconds=poll_interval_seconds,
            on_error_visibility_timeout_seconds=on_error_visibility_timeout_seconds,
            timeout=timeout,
            debug=debug,
            crash_on_error=crash_on_error,
            ack_on_error=ack_on_error,
        )

    def get_wsgi_app(self) -> WSGI:
        """Return a WSGI app that executes Celery tasks from Vercel Queue callbacks."""

        return build_wsgi_app(lambda raw_body: handle_queue_callback(self, raw_body))

    def get_asgi_app(self) -> ASGI:
        """Return an ASGI app that executes Celery tasks from Vercel Queue callbacks."""

        return build_asgi_app(lambda raw_body: handle_queue_callback(self, raw_body))


def get_wsgi_app(celery_app: CeleryApp) -> WSGI:
    """Return a WSGI app that executes Celery tasks from Vercel Queue callbacks."""

    return build_wsgi_app(lambda raw_body: handle_queue_callback(celery_app, raw_body))


def get_asgi_app(celery_app: CeleryApp) -> ASGI:
    """Return an ASGI app that executes Celery tasks from Vercel Queue callbacks."""

    return build_asgi_app(lambda raw_body: handle_queue_callback(celery_app, raw_body))


def broker_url(alias: str = "vercelqueue") -> str:
    """Return the broker URL for the installed Kombu transport alias."""

    return f"{alias}://"


def handle_queue_callback(
    celery_app: CeleryApp,
    raw_body: bytes,
) -> tuple[int, list[tuple[str, str]], bytes]:
    """
    Core callback handler shared by WSGI/ASGI wrappers.

    Returns: (status_code, headers, body_bytes)
    """

    extender: queue_callback.VisibilityExtender | None = None
    try:
        queue_name, consumer_group, message_id = queue_callback.parse_cloudevent(raw_body)

        conf = getattr(celery_app, "conf", None)
        transport_options = getattr(conf, "broker_transport_options", None)
        cfg = TransportConfig.from_transport_options(
            transport_options if isinstance(transport_options, dict) else {},
        )

        payload, delivery_count, created_at, ticket = queue_callback.receive_message_by_id(
            queue_name,
            consumer_group,
            message_id,
            visibility_timeout_seconds=cfg.visibility_timeout_seconds,
            timeout=cfg.timeout,
        )

        extender = queue_callback.VisibilityExtender(
            queue_name,
            consumer_group,
            message_id,
            ticket,
            visibility_timeout_seconds=cfg.visibility_timeout_seconds,
            refresh_interval_seconds=cfg.visibility_refresh_interval_seconds,
            timeout=cfg.timeout,
        )
        extender.start()

        # Execute
        outcome = _execute_envelope(celery_app, payload)
        timeout_seconds = outcome.get("timeoutSeconds")

        # Ack or delay
        if ticket:
            if timeout_seconds is not None:
                if extender is not None:
                    extender.finalize(
                        lambda: queue_callback.change_visibility(
                            queue_name,
                            consumer_group,
                            message_id,
                            ticket,
                            int(timeout_seconds),
                            timeout=cfg.timeout,
                        ),
                    )
                else:
                    queue_callback.change_visibility(
                        queue_name,
                        consumer_group,
                        message_id,
                        ticket,
                        int(timeout_seconds),
                        timeout=cfg.timeout,
                    )
            else:
                if extender is not None:
                    extender.finalize(
                        lambda: queue_callback.delete_message(
                            queue_name,
                            consumer_group,
                            message_id,
                            ticket,
                            timeout=cfg.timeout,
                        ),
                    )
                else:
                    queue_callback.delete_message(
                        queue_name,
                        consumer_group,
                        message_id,
                        ticket,
                        timeout=cfg.timeout,
                    )

        body = json.dumps(
            {
                "ok": True,
                "queue": queue_name,
                "consumer": consumer_group,
                "messageId": message_id,
                "deliveryCount": delivery_count,
                "createdAt": created_at,
                "delayed": bool(timeout_seconds is not None),
                **({"timeoutSeconds": int(timeout_seconds)} if timeout_seconds is not None else {}),
            },
        ).encode("utf-8")
        return (
            200,
            [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
            body,
        )
    except ValueError as exc:
        # CloudEvent parsing/validation errors are client errors.
        err = json.dumps({"error": str(exc), "type": exc.__class__.__name__}).encode("utf-8")
        return (
            400,
            [("Content-Type", "application/json"), ("Content-Length", str(len(err)))],
            err,
        )
    except VQSError as exc:
        status_code = getattr(exc, "status_code", None) or 500
        err_payload: dict[str, Any] = {"error": str(exc), "type": exc.__class__.__name__}

        retry_after = getattr(exc, "retry_after", None)
        if isinstance(retry_after, int):
            err_payload["retryAfter"] = retry_after

        body = json.dumps(err_payload).encode("utf-8")
        reason = status_reason(int(status_code))
        print(
            f"vercel.workers.celery.handle_queue_callback error ({int(status_code)} {reason}):",
            repr(exc),
        )
        return (
            int(status_code),
            [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
            body,
        )
    except Exception as exc:
        print("vercel.workers.celery.handle_queue_callback error:", repr(exc))
        body = b'{"error":"internal"}'
        return (
            500,
            [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
            body,
        )
    finally:
        if extender is not None:
            extender.stop()
