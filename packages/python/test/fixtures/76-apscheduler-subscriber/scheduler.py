import os
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from vercel.cache import get_cache

# The deployment harness substitutes the placeholder per run, so ticks from
# an earlier CI run of the same project can never satisfy this run's probe.
# Must match the copy in app.py.
TICKS_KEY = "ticks-RANDOMNESS_PLACEHOLDER"

# The test only ever probes preview deployments, where fast ticks are needed
# and the chain idles out after the configured deadline. Should this project
# ever get a production deployment, its chain would run forever - back off
# to a daily tick there so it cannot hammer the Runtime Cache and queues.
_INTERVAL = (
    {"days": 1}
    if os.environ.get("VERCEL_ENV") == "production"
    else {"seconds": 5}
)

scheduler = BackgroundScheduler()


@scheduler.scheduled_job("interval", id="tick", **_INTERVAL)
def tick() -> None:
    cache = get_cache(namespace="aps")
    ticks = cache.get(TICKS_KEY) or []
    stamp = datetime.now(timezone.utc).isoformat()
    cache.set(TICKS_KEY, [*ticks, stamp], options={"ttl": 600})
