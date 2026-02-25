from __future__ import annotations

from vercel.workers.celery import Celery

# This queue name MUST match the Vercel Queues topic you configure in vercel.json.
QUEUE_NAME = "celery"

# Create a Celery app that publishes tasks into Vercel Queues.
app = Celery("celery-example", queue_name=QUEUE_NAME)


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
