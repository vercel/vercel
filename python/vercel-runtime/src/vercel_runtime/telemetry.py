from __future__ import annotations

import contextvars
from typing import TYPE_CHECKING, Any, TypedDict

if TYPE_CHECKING:
    from collections.abc import Callable


class RootSpanContext(TypedDict):
    traceId: str
    spanId: str


class TelemetryContext(TypedDict):
    reportSpans: Callable[[dict[str, Any]], None]
    rootSpanContext: RootSpanContext | None


_telemetry_var: contextvars.ContextVar[TelemetryContext | None] = (
    contextvars.ContextVar("telemetry", default=None)
)


def get_telemetry() -> TelemetryContext | None:
    return _telemetry_var.get()


def set_telemetry(
    ctx: TelemetryContext,
) -> contextvars.Token[TelemetryContext | None]:
    return _telemetry_var.set(ctx)


def reset_telemetry(
    token: contextvars.Token[TelemetryContext | None],
) -> None:
    _telemetry_var.reset(token)


def init_tracing() -> None:
    """Set up the Vercel span exporter if opentelemetry is installed."""
    try:
        from vercel_runtime._tracing import (  # pyright: ignore[reportMissingModuleSource]
            init_tracing as _init,
        )
    except ImportError:
        return
    _init()
