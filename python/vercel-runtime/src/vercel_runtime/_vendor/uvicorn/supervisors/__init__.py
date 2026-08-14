from __future__ import annotations

from typing import TYPE_CHECKING

from vercel_runtime._vendor.uvicorn.supervisors.basereload import BaseReload
from vercel_runtime._vendor.uvicorn.supervisors.multiprocess import Multiprocess

if TYPE_CHECKING:
    ChangeReload: type[BaseReload]
else:
    try:
        from vercel_runtime._vendor.uvicorn.supervisors.watchfilesreload import WatchFilesReload as ChangeReload
    except ImportError:  # pragma: no cover
        from vercel_runtime._vendor.uvicorn.supervisors.statreload import StatReload as ChangeReload

__all__ = ["Multiprocess", "ChangeReload"]
