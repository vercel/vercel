from __future__ import annotations

import json
import sys


def generate_report():
    print(json.dumps({'ran': True, 'source': 'generate-report'}), file=sys.stderr)


def every_five():
    print(json.dumps({'ran': True, 'source': 'every-five'}), file=sys.stderr)
