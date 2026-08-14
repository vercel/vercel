from __future__ import annotations

import os
from pathlib import Path


def handler_b() -> None:
    marker_path = os.environ.get("CRON_MARKER_FILE_B")
    if marker_path:
        Path(marker_path).write_text("ran-b")
