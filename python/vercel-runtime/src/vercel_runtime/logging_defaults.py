from __future__ import annotations

import contextlib
import sys
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from types import ModuleType

_loguru_mod: ModuleType | None = None
_structlog_mod: ModuleType | None = None

with contextlib.suppress(ImportError):
    import loguru as _loguru_mod

with contextlib.suppress(ImportError):
    import structlog as _structlog_mod


def configure_loguru() -> None:
    if _loguru_mod is None:
        return
    with contextlib.suppress(ValueError):
        _loguru_mod.logger.remove(0)
    _loguru_mod.logger.add(sys.stderr, serialize=True)


def configure_structlog() -> None:
    if _structlog_mod is None:
        return
    if not _structlog_mod.is_configured():
        _structlog_mod.configure(
            processors=[
                _structlog_mod.contextvars.merge_contextvars,
                _structlog_mod.processors.add_log_level,
                _structlog_mod.processors.StackInfoRenderer(),
                _structlog_mod.processors.TimeStamper(fmt="iso"),
                _structlog_mod.processors.JSONRenderer(),
            ]
        )


def configure_logging_defaults() -> None:
    configure_loguru()
    configure_structlog()
