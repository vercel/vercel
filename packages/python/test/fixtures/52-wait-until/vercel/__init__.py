from __future__ import annotations

from typing import Any, Callable


def _load_wait_until() -> Callable[[Any], None]:
    try:
        from vercel_runtime.wait_until import wait_until
    except ModuleNotFoundError:
        from vercel_runtime import vc_init

        runtime_wait_until = getattr(vc_init, "_wait_until", None)
        wait_until = getattr(runtime_wait_until, "wait_until", None)
        if callable(wait_until):
            return wait_until
        raise
    else:
        return wait_until


wait_until = _load_wait_until()

__all__ = ["wait_until"]
