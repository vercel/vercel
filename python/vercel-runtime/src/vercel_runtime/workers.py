from __future__ import annotations

import contextlib
import os
from typing import Any, cast


def is_worker_service() -> bool:
    svc_type = os.environ.get("VERCEL_SERVICE_TYPE") or ""
    return svc_type.strip().lower() == "worker"


def _load_workers_runtime() -> Any | None:
    with contextlib.suppress(ImportError):
        import vercel.workers._runtime as workers_runtime  # type: ignore[import-not-found]  # noqa: PLC0415, PLC2701  # pyright: ignore[reportMissingImports]

        return workers_runtime
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
            '"vercel-workers" is missing. Install '
            '"vercel-workers" and configure an explicit worker integration.'
        )
    return cast(
        "object | None",
        workers_runtime.maybe_bootstrap_worker_service_app(module),
    )
