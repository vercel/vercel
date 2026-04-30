from __future__ import annotations

import contextlib
import importlib
import os
from typing import TYPE_CHECKING, Protocol, cast

if TYPE_CHECKING:
    from collections.abc import MutableMapping


class _WorkersRuntime(Protocol):
    def prepare_environment(
        self,
        environ: MutableMapping[str, str],
    ) -> None: ...

    def maybe_bootstrap_worker_service_app(
        self,
        module: object,
    ) -> object | None: ...


def is_worker_service() -> bool:
    svc_type = os.environ.get("VERCEL_SERVICE_TYPE") or ""
    normalized_type = svc_type.strip().lower()
    if normalized_type == "worker":
        return True

    svc_trigger = os.environ.get("VERCEL_SERVICE_TRIGGER") or ""
    normalized_trigger = svc_trigger.strip().lower()
    return normalized_type == "job" and normalized_trigger == "queue"


def has_worker_services() -> bool:
    value = os.environ.get("VERCEL_HAS_WORKER_SERVICES") or ""
    return value.strip().lower() in {"1", "true"}


def _load_workers_runtime() -> _WorkersRuntime | None:
    with contextlib.suppress(ImportError):
        runtime_module = cast(
            "object",
            importlib.import_module("vercel.workers._runtime"),
        )
        return cast("_WorkersRuntime", runtime_module)
    return None


def prepare_worker_environment() -> None:
    workers_runtime = _load_workers_runtime()
    if workers_runtime is None:
        return
    workers_runtime.prepare_environment(os.environ)


def maybe_bootstrap_worker_service_app(module: object) -> object | None:
    workers_runtime = _load_workers_runtime()
    if workers_runtime is None:
        raise RuntimeError(
            "Unable to bootstrap worker service because "
            + '"vercel-workers" is missing. Install '
            + '"vercel-workers" and configure an explicit worker integration.'
        )
    return workers_runtime.maybe_bootstrap_worker_service_app(module)
