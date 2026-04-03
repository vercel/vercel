import os

from celery import Celery

QUEUE_NAME = "jobs"

app = Celery(
    "worker",
    broker=os.getenv("CELERY_BROKER_URL", "vercel://"),
)
app.conf.task_default_queue = QUEUE_NAME
