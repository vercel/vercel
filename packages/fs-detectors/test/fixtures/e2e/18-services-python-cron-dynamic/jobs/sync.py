from __future__ import annotations

import asyncio
import json
import sys


async def daily_sync():
    await asyncio.sleep(0)
    print(json.dumps({'ran': True, 'source': 'daily-sync'}), file=sys.stderr)


async def every_minute():
    await asyncio.sleep(0)
    print(json.dumps({'ran': True, 'source': 'every-minute'}), file=sys.stderr)
