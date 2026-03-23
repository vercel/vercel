# pyright: reportMissingImports=false, reportUnknownVariableType=false
# pyright: reportUnknownParameterType=false, reportUnknownMemberType=false
# pyright: reportUnknownArgumentType=false
# mypy: ignore-errors
"""Vercel span exporter and propagator for OpenTelemetry.

This module is only imported when the opentelemetry SDK is installed by
the user application.  All type-checking errors from the optional
dependency are suppressed at the file level.
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

from google.protobuf.json_format import MessageToDict
from opentelemetry.context import Context, get_current
from opentelemetry.exporter.otlp.proto.common._internal.trace_encoder import (
    encode_spans,
)
from opentelemetry.propagate import get_global_textmap, set_global_textmap
from opentelemetry.propagators.composite import CompositePropagator
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import (
    SimpleSpanProcessor,
    SpanExporter,
    SpanExportResult,
)
from opentelemetry.trace import (
    SpanContext,
    TraceFlags,
    get_tracer_provider,
    set_span_in_context,
    set_tracer_provider,
)
from opentelemetry.trace.span import NonRecordingSpan

try:
    from opentelemetry.sdk.trace import ReadableSpan
except ImportError:
    from opentelemetry.sdk.trace.export import ReadableSpan

from vercel_runtime.telemetry import get_telemetry

if TYPE_CHECKING:
    from collections.abc import Sequence

    from opentelemetry.propagators.textmap import (
        CarrierT,
        Getter,
        Setter,
    )

_logger = logging.getLogger(__name__)


class VercelRuntimePropagator:
    """Propagates the root span context from the Vercel telemetry extension.

    Mirrors the JS ``VercelRuntimePropagator`` in ``@vercel/otel``: on
    ``extract`` it reads ``rootSpanContext`` from the Vercel telemetry
    context and sets it as the remote parent span context so that all
    subsequent spans are parented correctly.
    """

    def fields(self) -> list[str]:
        return []

    def inject(
        self,
        carrier: CarrierT,
        context: Context | None = None,
        setter: Setter[CarrierT] | None = None,
    ) -> None:
        pass

    def extract(
        self,
        carrier: CarrierT,
        context: Context | None = None,
        getter: Getter[CarrierT] | None = None,
    ) -> Context:
        if context is None:
            context = get_current()

        telemetry = get_telemetry()
        if telemetry is None:
            _logger.debug("vercel telemetry extension not found")
            return context

        root_span_context = telemetry.get("rootSpanContext")
        if root_span_context is None:
            return context

        trace_id = root_span_context.get("traceId", "")
        span_id = root_span_context.get("spanId", "")
        if not trace_id or not span_id:
            return context

        trace_flags = root_span_context.get("traceFlags", TraceFlags.SAMPLED)

        _logger.debug(
            "extracted root SpanContext from Vercel request context: %s",
            root_span_context,
        )

        span_context = SpanContext(
            trace_id=int(trace_id, 16),
            span_id=int(span_id, 16),
            is_remote=True,
            trace_flags=TraceFlags(trace_flags),
        )
        return set_span_in_context(NonRecordingSpan(span_context), context)


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
    """Set up the Vercel span exporter and propagator.

    If a TracerProvider is already configured, the exporter is added to
    it.  Otherwise a new TracerProvider is created and set as the global
    provider.

    The ``VercelRuntimePropagator`` is prepended to the global text-map
    propagator so that the root span context from the Vercel runtime is
    used as the parent for all subsequent spans.
    """
    processor = SimpleSpanProcessor(VercelSpanExporter())

    current_provider = get_tracer_provider()
    if isinstance(current_provider, TracerProvider):
        current_provider.add_span_processor(processor)
    else:
        resource = Resource.create(
            {
                k: v
                for k, v in {
                    "service.name": os.environ.get(
                        "VERCEL_PROJECT_ID", "python"
                    ),
                    "env": os.environ.get("VERCEL_ENV"),
                    "vercel.region": os.environ.get("VERCEL_REGION"),
                    "vercel.runtime": "python",
                    "vercel.sha": os.environ.get("VERCEL_GIT_COMMIT_SHA"),
                    "vercel.host": os.environ.get("VERCEL_URL"),
                    "vercel.branch_host": os.environ.get("VERCEL_BRANCH_URL"),
                    "vercel.deployment_id": os.environ.get(
                        "VERCEL_DEPLOYMENT_ID"
                    ),
                    "service.version": os.environ.get("VERCEL_DEPLOYMENT_ID"),
                    "vercel.project_id": os.environ.get("VERCEL_PROJECT_ID"),
                }.items()
                if v is not None
            }
        )
        provider = TracerProvider(resource=resource)
        provider.add_span_processor(processor)
        set_tracer_provider(provider)

    current_propagator = get_global_textmap()
    set_global_textmap(
        CompositePropagator([VercelRuntimePropagator(), current_propagator])
    )
