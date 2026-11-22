"""Child-process entry for schedule scripts.

`vercel_runtime.schedules` starts `python -m vercel_runtime.schedule_bootstrap
<script>` once per firing. The script runs as `__main__`, as if started with
`python <script>`. `logging` records go to a pipe inherited from the
supervisor, so they keep their level when the platform attributes them to the
invocation; plain stdout and stderr are forwarded as streams.
"""

from __future__ import annotations

import json
import logging
import os
import runpy
import sys
from typing import TextIO

LOG_FD_ENV = "__VC_SCHEDULE_LOG_FD"
"""Names the inherited fd that receives level-tagged `logging` records."""

_log = logging.getLogger("vercel.schedules")


class _RecordPipeHandler(logging.Handler):
    """Write each record as one JSON line: its level and formatted text."""

    def __init__(self, stream: TextIO) -> None:
        super().__init__()
        self._stream = stream
        # The level travels separately, so `basicConfig` must not prefix it.
        self.setFormatter(logging.Formatter("%(message)s"))

    def emit(self, record: logging.LogRecord) -> None:
        try:
            line = json.dumps(
                {"level": record.levelno, "message": self.format(record)}
            )
            self._stream.write(line + "\n")
            self._stream.flush()
        except Exception:
            self.handleError(record)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(
            "usage: python -m vercel_runtime.schedule_bootstrap <script>"
        )
    script = sys.argv[1]

    log_fd = os.environ.pop(LOG_FD_ENV, None)
    if log_fd is not None:
        stream = os.fdopen(int(log_fd), "w", encoding="utf-8", buffering=1)
        logging.basicConfig(
            level=logging.INFO,
            handlers=[_RecordPipeHandler(stream)],
            force=True,
        )

    # Match `python <script>`: its directory leads the import path and it
    # sees only its own path in argv.
    sys.argv = [script]
    sys.path.insert(0, os.path.dirname(script))
    try:
        runpy.run_path(script, run_name="__main__")
    except Exception:
        _log.exception('schedule entrypoint "%s" raised', script)
        sys.exit(1)


if __name__ == "__main__":
    main()
