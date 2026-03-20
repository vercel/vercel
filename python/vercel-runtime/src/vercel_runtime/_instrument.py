# pyright: reportMissingImports=false, reportUnknownVariableType=false
# pyright: reportUnknownParameterType=false, reportUnknownMemberType=false
# pyright: reportUnknownArgumentType=false
# mypy: ignore-errors
"""Auto-instrument installed OpenTelemetry instrumentation libraries.

This module is only imported when ``VERCEL_TELEMETRY_MODE=auto`` and the
OpenTelemetry SDK is present.  It discovers all installed OTel
instrumentors via ``importlib.metadata`` entry points and activates them.
"""

from __future__ import annotations

import importlib.metadata
import logging

_logger = logging.getLogger(__name__)


def instrument_installed() -> None:
    """Discover and activate all installed OTel instrumentation packages.

    Each ``opentelemetry-instrumentation-*`` package registers an entry
    point under the ``opentelemetry_instrumentor`` group.  This function
    iterates over those entry points, loads each instrumentor class, and
    calls ``.instrument()`` on it — the same mechanism used by the
    official ``opentelemetry-instrument`` CLI.
    """
    eps = importlib.metadata.entry_points(group="opentelemetry_instrumentor")

    for ep in eps:
        try:
            instrumentor_class = ep.load()
            instrumentor = instrumentor_class()
            if not instrumentor.is_instrumented_by_opentelemetry:
                instrumentor.instrument()
                _logger.debug("instrumented %s", ep.name)
        except Exception:
            _logger.debug("could not instrument %s", ep.name, exc_info=True)
