from __future__ import annotations

import os
from pathlib import Path


def handler_a() -> None:
    marker_path = os.environ.get("CRON_MARKER_FILE_A")
    if marker_path:
        Path(marker_path).write_text("ran-a")
