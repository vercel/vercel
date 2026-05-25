from __future__ import annotations

import asyncio
import json
import sys


async def async_handler():
    await asyncio.sleep(0)
    print(json.dumps({'ran': True, 'source': 'async-handler'}), file=sys.stderr)
