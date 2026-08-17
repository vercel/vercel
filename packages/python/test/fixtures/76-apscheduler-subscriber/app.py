import time
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from vercel.cache import get_cache

import scheduler as scheduler_module

# Must match scheduler.TICKS_KEY; the harness substitutes all copies.
TICKS_KEY = "ticks-RANDOMNESS_PLACEHOLDER"
STOP_COUNT_KEY = "stop-count-RANDOMNESS_PLACEHOLDER"

app = FastAPI()


@app.get("/")
def index() -> dict[str, str]:
    return {"service": "web"}


@app.get("/ticks")
def ticks(min_count: int = 2):
    cache = get_cache(namespace="aps")
    deadline = time.time() + 30
    recorded: list[str] = []
    while time.time() < deadline:
        recorded = cache.get(TICKS_KEY) or []
        if len(recorded) >= min_count:
            return {"ok": True, "count": len(recorded), "ticks": recorded}
        time.sleep(1.0)
    return JSONResponse(
        {"ok": False, "count": len(recorded), "ticks": recorded},
        status_code=504,
    )


@app.get("/verify-idle")
def verify_idle(min_quiet: float = 8.0):
    """Confirm the chain idled out: the newest tick must be old enough.

    This request reactivates the scheduler, but reactivation rebases jobs
    to the request time instead of replaying the inactive interval, so the
    next tick lands a full interval after the read below.
    """
    cache = get_cache(namespace="aps")
    recorded: list[str] = cache.get(TICKS_KEY) or []
    if not recorded:
        return JSONResponse({"ok": False, "count": 0}, status_code=500)
    newest = max(datetime.fromisoformat(stamp) for stamp in recorded)
    quiet = (datetime.now(timezone.utc) - newest).total_seconds()
    body = {
        "ok": quiet >= min_quiet,
        "quiet_seconds": quiet,
        "count": len(recorded),
    }
    if body["ok"]:
        return body
    return JSONResponse(body, status_code=504)


@app.get("/reset")
def reset():
    """Clear idle-phase ticks so the pause phase counts from zero."""
    cache = get_cache(namespace="aps")
    cache.set(TICKS_KEY, [], options={"ttl": 600})
    return {"ok": True}


@app.get("/stop")
def stop():
    """Snapshot the tick count, then durably pause the chain.

    The integration turns pause() into a durable state transition that
    fences unclaimed wakes, so calling it here reaches the chain served
    by the subscriber function.
    """
    cache = get_cache(namespace="aps")
    count = len(cache.get(TICKS_KEY) or [])
    cache.set(STOP_COUNT_KEY, count, options={"ttl": 600})
    scheduler_module.scheduler.pause()
    return {"ok": True, "count": count}


@app.get("/verify-stopped")
def verify_stopped(allowed_extra: int = 1):
    """Confirm the chain ended after /stop.

    The count may exceed the snapshot by at most the wake that was in
    flight when the pause committed. Requests after an explicit pause
    never resume the scheduler, so this request cannot restart the chain
    it is checking; a broken pause keeps ticking every interval instead.
    """
    cache = get_cache(namespace="aps")
    snapshot = cache.get(STOP_COUNT_KEY)
    if snapshot is None:
        return JSONResponse({"ok": False, "snapshot": None}, status_code=500)
    count = len(cache.get(TICKS_KEY) or [])
    body = {
        "ok": count <= snapshot + allowed_extra,
        "count": count,
        "snapshot": snapshot,
    }
    if body["ok"]:
        return body
    return JSONResponse(body, status_code=504)
