from __future__ import annotations

import base64
import contextlib
import json
from datetime import UTC, datetime
from typing import Any, TypedDict, cast

from celery import Celery as CeleryApp  # type: ignore[import-untyped]
from celery.exceptions import (  # type: ignore[import-untyped]
    Ignore,
    Reject,
    Retry,
)

__all__ = [
    "CeleryTaskEnvelope",
    "ExecutionOutcome",
    "_coerce_int",
    "_execute_envelope",
    "_extract_task_from_kombu_message",
    "_extract_task_from_payload",
    "_now_utc",
    "_parse_iso_datetime",
    "_retry_timeout_seconds_from_exc",
]


class CeleryTaskEnvelope(TypedDict, total=False):
    """
    Minimal, JSON-serialisable task envelope stored in Vercel Queues.

    We intentionally do NOT store arbitrary pickled Celery messages. This keeps the
    payload safe, portable, and compatible with Vercel Queues' JSON-first design.
    """

    vercel: dict[str, Any]
    task: str
    id: str
    args: list[Any]
    kwargs: dict[str, Any]
    retries: int
    eta: str
    expires: str
    raw: dict[str, Any]


class ExecutionOutcome(TypedDict, total=False):
    timeoutSeconds: int
    ack: bool


def _now_utc() -> datetime:
    return datetime.now(UTC)


def _parse_iso_datetime(value: str | None) -> datetime | None:
    """
    Parse an ISO-8601 datetime string into a timezone-aware datetime.

    Celery commonly uses ISO strings (sometimes with trailing 'Z').
    Returns None when parsing fails.
    """

    if not value or not isinstance(value, str):
        return None
    s = value.strip()
    if not s:
        return None
    # Handle common "Z" suffix for UTC.
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except Exception:  # noqa: BLE001
        return None
    if dt.tzinfo is None:
        # Assume naive datetimes are UTC.
        dt = dt.replace(tzinfo=UTC)
    return dt


def _coerce_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _retry_timeout_seconds_from_exc(exc: BaseException, default: int = 60) -> int:
    """
    Best-effort extraction of retry delay from Celery's Retry exception.
    """

    when = getattr(exc, "when", None)
    if isinstance(when, (int, float)):
        return max(0, int(when))
    if isinstance(when, datetime):
        delta = (when - _now_utc()).total_seconds()
        return max(0, int(delta))

    eta = getattr(exc, "eta", None)
    if isinstance(eta, datetime):
        delta = (eta - _now_utc()).total_seconds()
        return max(0, int(delta))

    return default


def _extract_task_from_kombu_message(
    message: Any,
    *,
    include_raw: bool = False,
) -> CeleryTaskEnvelope:
    """
    Convert a Kombu message dict into our JSON envelope.

    Celery's protocol varies by version/protocol setting; we support the two most
    common shapes:
      - protocol v2: headers contain task/id, body is [args, kwargs, embed]
      - protocol v1: body is a dict with task/id/args/kwargs
    """

    if not isinstance(message, dict):
        raise TypeError("Expected kombu message to be a dict")

    headers = message.get("headers") if isinstance(message.get("headers"), dict) else {}
    body: Any = message.get("body")

    # kombu's virtual transport encodes message bodies to ASCII by default
    # (body_encoding="base64"). If present, decode it back to bytes first.
    props_value = message.get("properties")
    props: dict[str, Any] = {}
    if isinstance(props_value, dict):
        props = cast(dict[str, Any], props_value)

    body_encoding_value = props.get("body_encoding")
    body_encoding = body_encoding_value if isinstance(body_encoding_value, str) else None
    if body_encoding and body_encoding.lower() == "base64":
        if isinstance(body, str):
            try:
                body = base64.b64decode(body.encode("ascii"))
            except Exception:  # noqa: BLE001
                pass
        elif isinstance(body, (bytes, bytearray)):
            try:
                body = base64.b64decode(bytes(body))
            except Exception:  # noqa: BLE001
                pass

    # Depending on kombu/celery version & transport internals, `body` might already be
    # a Python structure (list/tuple/dict) OR it may still be JSON-encoded bytes/str.
    with contextlib.suppress(Exception):
        if isinstance(body, (bytes, bytearray)):
            body = json.loads(bytes(body).decode("utf-8"))
        elif isinstance(body, str):
            body = json.loads(body)

    task_name: str | None = None
    task_id: str | None = None
    retries: int = 0
    eta: str | None = None
    expires: str | None = None

    if isinstance(headers, dict):
        task_name = headers.get("task") if isinstance(headers.get("task"), str) else None
        task_id = headers.get("id") if isinstance(headers.get("id"), str) else None
        retries = _coerce_int(headers.get("retries", 0), 0)
        eta = headers.get("eta") if isinstance(headers.get("eta"), str) else None
        expires = headers.get("expires") if isinstance(headers.get("expires"), str) else None

    def _maybe_decode_json(value: Any) -> Any:
        with contextlib.suppress(Exception):
            if isinstance(value, (bytes, bytearray)):
                return json.loads(bytes(value).decode("utf-8"))
            elif isinstance(value, str):
                return json.loads(value)
        return value

    def _coerce_args(value: Any) -> list[Any]:
        value = _maybe_decode_json(value)
        if value is None:
            return []
        if isinstance(value, (list, tuple)):
            return list(value)
        return []

    def _coerce_kwargs(value: Any) -> dict[str, Any]:
        value = _maybe_decode_json(value)
        if value is None:
            return {}
        if isinstance(value, dict):
            return dict(value)
        return {}

    args: list[Any] = []
    kwargs: dict[str, Any] = {}

    if isinstance(body, (list, tuple)) and len(body) >= 2:
        # protocol v2
        args = _coerce_args(body[0])
        kwargs = _coerce_kwargs(body[1])
    elif isinstance(body, dict):
        # protocol v1-like
        if task_name is None and isinstance(body.get("task"), str):
            task_name = body.get("task")
        if task_id is None and isinstance(body.get("id"), str):
            task_id = body.get("id")
        args = _coerce_args(body.get("args"))
        kwargs = _coerce_kwargs(body.get("kwargs"))

    if not task_name:
        raise ValueError("Unable to determine task name from Celery message")
    if not task_id:
        # Celery normally always sets an id; if not present, fall back to kombu properties
        properties_value = message.get("properties")
        properties: dict[str, Any] = {}
        if isinstance(properties_value, dict):
            properties = cast(dict[str, Any], properties_value)
        correlation_id = properties.get("correlation_id")
        task_id = correlation_id if isinstance(correlation_id, str) else ""
    if not task_id:
        raise ValueError("Unable to determine task id from Celery message")

    raw: dict[str, Any] = {"headers": headers, "body": body}
    raw_properties = message.get("properties")
    if isinstance(raw_properties, dict):
        raw["properties"] = raw_properties

    envelope: CeleryTaskEnvelope = {
        "vercel": {"kind": "celery", "version": 1},
        "task": task_name,
        "id": task_id,
        "args": args,
        "kwargs": kwargs,
        "retries": retries,
    }
    if eta:
        envelope["eta"] = eta
    if expires:
        envelope["expires"] = expires

    if include_raw:
        envelope["raw"] = raw
    return envelope


def _extract_task_from_payload(payload: Any) -> CeleryTaskEnvelope:
    """
    Accept either a CeleryTaskEnvelope (preferred) or a raw kombu message dict.
    """

    if isinstance(payload, dict):
        vercel_info = payload.get("vercel")
        if isinstance(vercel_info, dict) and vercel_info.get("kind") == "celery":
            # Assume already in our envelope format
            env = cast(CeleryTaskEnvelope, payload)
            if not env.get("task") or not env.get("id"):
                raise ValueError("Invalid Celery task envelope: missing task/id")
            return env

    # Fallback: attempt to parse raw kombu message shape
    return _extract_task_from_kombu_message(payload)


def _execute_envelope(celery_app: CeleryApp, payload: Any) -> ExecutionOutcome:
    """
    Execute a single Celery task message.

    Returns:
      - {"ack": True} on success (or Ignore)
      - {"timeoutSeconds": N} for Retry
    """

    env = _extract_task_from_payload(payload)
    task_name = cast(str, env.get("task"))
    task_id = cast(str, env.get("id"))
    args = env.get("args") or []
    kwargs = env.get("kwargs") or {}
    eta_dt = _parse_iso_datetime(env.get("eta"))
    expires_dt = _parse_iso_datetime(env.get("expires"))

    # Message-level scheduling:
    # - If expires is in the past, acknowledge without executing.
    # - If eta is in the future, ask the queue to retry later (delay visibility).
    #
    # We do this here (instead of at publish time) because Vercel Queues v2 is
    # callback-driven and does not expose a dedicated "delay on send" API that
    # Celery can target generically via Kombu.
    now = _now_utc()
    if expires_dt is not None and expires_dt <= now:
        return {"ack": True}
    if eta_dt is not None and eta_dt > now:
        delay_seconds = int(max(0.0, (eta_dt - now).total_seconds()))
        return {"timeoutSeconds": delay_seconds}

    task = celery_app.tasks.get(task_name)
    if task is None:
        raise LookupError(f"Celery task not found: {task_name!r}")

    try:
        # Use apply() so Celery sets up request context (self.request, retries, etc.)
        # We use throw=True so exceptions propagate and can be mapped to queue semantics.
        task.apply(args=args, kwargs=kwargs, task_id=task_id, throw=True)  # type: ignore[arg-type]
        return {"ack": True}
    except Ignore:
        # Ignore means "ack but don't store result"
        return {"ack": True}
    except Retry as exc:
        return {"timeoutSeconds": _retry_timeout_seconds_from_exc(exc)}
    except Reject as exc:
        # Reject(requeue=True) should delay/retry; Reject(requeue=False) should ack
        requeue = bool(getattr(exc, "requeue", False))
        if requeue:
            return {"timeoutSeconds": 60}
        return {"ack": True}
