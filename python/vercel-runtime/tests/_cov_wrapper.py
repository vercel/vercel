"""Coverage wrapper for subprocess-based tests.

Starts coverage before running the target script and saves
data on exit, ensuring SIGTERM also produces coverage output.
"""

from __future__ import annotations

import atexit
import os
import signal
import sys

import coverage

# Use source_pkgs so coverage traces `vercel_runtime`
# regardless of how the script is invoked.
_src = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "src",
    "vercel_runtime",
)
cov = coverage.Coverage(
    data_suffix=True,
    config_file=os.environ.get("COVERAGE_RCFILE") or True,
    source=[_src],
)
cov.start()


def _save() -> None:
    cov.stop()
    cov.save()


atexit.register(_save)


def _sigterm(signum: int, frame: object) -> None:
    sys.exit(0)


signal.signal(signal.SIGTERM, _sigterm)

# Run the target script (first arg after this wrapper)
target = sys.argv[1]
sys.argv[:] = sys.argv[1:]
with open(target) as f:
    code = compile(f.read(), target, "exec")
    exec(code, {"__name__": "__main__", "__file__": target})
