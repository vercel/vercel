from __future__ import annotations

import os

from celery import Celery

# This queue name MUST match the Vercel Queues topic you configure in vercel.json.
QUEUE_NAME = "celery"

# On Vercel and in `vercel dev`, CELERY_BROKER_URL defaults to `vercel://`.
# Locally, you may point it to a separate broker, e.g. Redis.
app = Celery(
    "celery-example",
    broker=os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"),
)
app.conf.task_default_queue = QUEUE_NAME


@app.task(bind=True, name="tasks.add")
def add(self, x: int, y: int) -> int:
    result = x + y
    print(f"[celery task] add({x}, {y}) = {result}")
    return result


@app.task(bind=True, name="tasks.multiply")
def multiply(self, x: int, y: int) -> int:
    result = x * y
    print(f"[celery task] multiply({x}, {y}) = {result}")
    return result
