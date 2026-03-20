from __future__ import annotations

import contextvars
import os
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
    if os.environ.get("TELEMETRY_DISABLED") == "true":
        return

    """Set up the Vercel span exporter if opentelemetry is installed."""
    import importlib.util

    try:
        found = importlib.util.find_spec("opentelemetry.sdk.trace")
    except (ModuleNotFoundError, ValueError):
        found = None

    if found is None:
        return

    from vercel_runtime._tracing import (  # pyright: ignore[reportMissingModuleSource]
        init_tracing as _init,
    )

    _init()

    # Auto-instrument installed libraries when telemetry mode is 'auto'
    if os.environ.get("VERCEL_TELEMETRY_MODE") == "auto":
        from vercel_runtime._instrument import (  # pyright: ignore[reportMissingModuleSource]
            instrument_installed,
        )

        instrument_installed()
