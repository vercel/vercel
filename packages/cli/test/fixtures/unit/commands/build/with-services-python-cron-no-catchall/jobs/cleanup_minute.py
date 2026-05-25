from __future__ import annotations

import json
import sys

if __name__ == '__main__':
    print(json.dumps({'ran': True, 'source': 'cleanup-minute-cron'}), file=sys.stderr)
