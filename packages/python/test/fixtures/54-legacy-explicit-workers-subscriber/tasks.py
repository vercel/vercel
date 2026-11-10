from __future__ import annotations

import os

from celery import Celery
from vercel.cache import get_cache

# Must match the topic configured in [tool.vercel.subscribers] in pyproject.toml.
QUEUE_NAME = "celery"
CACHE_NAMESPACE = "celery-jobs"

# On Vercel the builder sets VERCEL_HAS_WORKER_SERVICES, which makes the runtime
# default CELERY_BROKER_URL to "vercel://" and install the kombu transport that
# publishes tasks to Vercel Queues.
app = Celery("celery-subscriber", broker=os.getenv("CELERY_BROKER_URL", "vercel://"))
app.conf.task_default_queue = QUEUE_NAME


@app.task(name="tasks.process_job")
def process_job(request_id: str, x: int, y: int) -> int:
    total = x + y
    # Record the result in the runtime cache so the web function can observe
    # that the background job ran.
    get_cache(namespace=CACHE_NAMESPACE).set(
        request_id,
        {"requestId": request_id, "sum": total},
        options={"ttl": 300},
    )
    return total
