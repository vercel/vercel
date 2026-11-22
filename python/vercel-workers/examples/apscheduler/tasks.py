from __future__ import annotations

from datetime import UTC, datetime

from apscheduler.triggers.cron import CronTrigger

from vercel.workers.apscheduler import VercelQueueScheduler

# This topic MUST match the Vercel Queues topic configured in vercel.json.
WAKEUP_TOPIC = "aps-wakeups"
SCHEDULER_ID = "apscheduler-example"


def heartbeat() -> None:
    now = datetime.now(UTC).isoformat()
    print(f"[apscheduler job] heartbeat at {now}")

scheduler = VercelQueueScheduler(
    scheduler_id=SCHEDULER_ID,
    wakeup_topic=WAKEUP_TOPIC,
    timezone=UTC,
)
scheduler.add_job(
    heartbeat,
    trigger=CronTrigger(second="*/30", timezone=UTC),
    id="heartbeat",
    name="Heartbeat every 30 seconds",
    replace_existing=True,
)
