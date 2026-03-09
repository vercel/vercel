from __future__ import annotations

import asyncio
import os
from pathlib import Path


async def async_handler():
    await asyncio.sleep(0)
    marker_path = os.environ.get("CRON_MARKER_FILE")
    if marker_path:
        marker = Path(marker_path)
        marker.write_text("ran-async")
