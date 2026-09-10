from __future__ import annotations

import json
import sys


def sync_handler():
    print(json.dumps({'ran': True, 'source': 'sync-handler'}), file=sys.stderr)
