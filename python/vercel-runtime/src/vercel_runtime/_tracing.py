# pyright: reportMissingImports=false, reportUnknownVariableType=false
# pyright: reportUnknownParameterType=false, reportUnknownMemberType=false
# pyright: reportUnknownArgumentType=false
# mypy: ignore-errors
"""Vercel span exporter for OpenTelemetry.

This module is only imported when the opentelemetry SDK is installed by
the user application.  All type-checking errors from the optional
dependency are suppressed at the file level.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from google.protobuf.json_format import MessageToDict
from opentelemetry.exporter.otlp.proto.common._internal.trace_encoder import (
    encode_spans,
)
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import (
    SimpleSpanProcessor,
    SpanExporter,
    SpanExportResult,
)
from opentelemetry.trace import get_tracer_provider, set_tracer_provider

try:
    from opentelemetry.sdk.trace import ReadableSpan
except ImportError:
    from opentelemetry.sdk.trace.export import ReadableSpan

from vercel_runtime.telemetry import get_telemetry

if TYPE_CHECKING:
    from collections.abc import Sequence

_logger = logging.getLogger(__name__)


class VercelSpanExporter(SpanExporter):
    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        telemetry = get_telemetry()

        report_spans = telemetry.get("reportSpans") if telemetry else None
        if report_spans is None:
            _logger.debug("no reportSpans function in telemetry context")
            return SpanExportResult.SUCCESS

        try:
            proto = encode_spans(spans)
            data = MessageToDict(proto)
            report_spans(data)
            return SpanExportResult.SUCCESS
        except Exception:
            _logger.exception("could not export spans")
            return SpanExportResult.FAILURE

    def shutdown(self) -> None:
        pass

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return True


def init_tracing() -> None:
    """Set up the Vercel span exporter.

    If a TracerProvider is already configured, the exporter is added to
    it.  Otherwise a new TracerProvider is created and set as the global
    provider.
    """
    processor = SimpleSpanProcessor(VercelSpanExporter())

    current_provider = get_tracer_provider()
    if isinstance(current_provider, TracerProvider):
        current_provider.add_span_processor(processor)
    else:
        provider = TracerProvider()
        provider.add_span_processor(processor)
        set_tracer_provider(provider)
