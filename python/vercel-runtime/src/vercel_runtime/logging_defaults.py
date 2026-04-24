from __future__ import annotations

import contextlib
import json
import sys
import traceback
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from types import ModuleType

_loguru_mod: ModuleType | None = None
_structlog_mod: ModuleType | None = None

with contextlib.suppress(ImportError):
    import loguru as _loguru_mod

with contextlib.suppress(ImportError):
    import structlog as _structlog_mod


def _loguru_json_sink(message: Any) -> None:
    record = message.record
    exc = record["exception"]
    log_entry: dict[str, Any] = {
        **record["extra"],
        "message": record["message"],
        "level": record["level"].name,
        "time": record["time"].isoformat(),
        "module": record["module"],
        "file": record["file"].path,
        "line": record["line"],
        "function": record["function"],
        "exception": "".join(
            traceback.format_exception(exc.type, exc.value, exc.traceback)
        )
        if exc
        else None,
    }
    sys.stderr.write(json.dumps(log_entry) + "\n")


def configure_loguru() -> None:
    if _loguru_mod is None:
        return
    with contextlib.suppress(ValueError):
        _loguru_mod.logger.remove(0)
    _loguru_mod.logger.add(_loguru_json_sink)


def _add_message_field(
    _logger: Any, _method: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    event_dict.setdefault("message", event_dict["event"])
    return event_dict


def configure_structlog() -> None:
    if _structlog_mod is None:
        return
    if not _structlog_mod.is_configured():
        _structlog_mod.configure(
            processors=[
                _structlog_mod.contextvars.merge_contextvars,
                _structlog_mod.processors.add_log_level,
                _structlog_mod.processors.CallsiteParameterAdder(
                    [
                        _structlog_mod.processors.CallsiteParameter.MODULE,
                        _structlog_mod.processors.CallsiteParameter.FILENAME,
                        _structlog_mod.processors.CallsiteParameter.LINENO,
                        _structlog_mod.processors.CallsiteParameter.FUNC_NAME,
                    ],
                    additional_ignores=["vercel_runtime"],
                ),
                _structlog_mod.processors.StackInfoRenderer(),
                _structlog_mod.processors.ExceptionRenderer(),
                _structlog_mod.processors.TimeStamper(fmt="iso"),
                _add_message_field,
                _structlog_mod.processors.JSONRenderer(),
            ]
        )


def configure_logging_defaults() -> None:
    configure_loguru()
    configure_structlog()
