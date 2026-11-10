from __future__ import annotations

import os
from pathlib import Path

if __name__ == "__main__":
    marker_path = os.environ.get("CRON_MARKER_FILE")
    if marker_path:
        marker = Path(marker_path)
        marker.write_text("ran")
