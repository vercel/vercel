"""Helper that loads vc_init.py in legacy (non-IPC) mode.

Reads a JSON event from stdin, calls ``vc_handler``, and
writes the JSON response to fd 3.  We use a dedicated fd
so that vc_init.py's own print() calls (which go to
stdout/stderr) don't interfere with the result.
"""

import json
import os
import sys

# Open fd 3 for the result *before* exec'ing vc_init.py
# (the parent passes it via subprocess pipe).
_result_fd = int(os.environ["_RESULT_FD"])
_result_file = os.fdopen(_result_fd, "w")

target = sys.argv[1]
sys.argv[:] = sys.argv[1:]
with open(target) as f:
    code = compile(f.read(), target, "exec")
    globs = {"__name__": "__main__", "__file__": target}
    exec(code, globs)

vc_handler = globs["vc_handler"]

event = json.loads(sys.stdin.read())
result = vc_handler(event, {})
_result_file.write(json.dumps(result))
_result_file.flush()
