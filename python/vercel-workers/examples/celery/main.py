from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel
from tasks import QUEUE_NAME, add, multiply

app = FastAPI(
    title="Celery on Vercel Queues (example)",
    description="Enqueue Celery tasks that are published to Vercel Queues via vercel-workers.",
    version="0.1.0",
)


class EnqueueRequest(BaseModel):
    x: int
    y: int


@app.get("/")
def root():
    return {
        "message": "POST to /enqueue with {x, y} to enqueue a Celery task.",
        "queue": QUEUE_NAME,
    }


@app.post("/enqueue/add")
def enqueue_add(body: EnqueueRequest):
    async_result = add.delay(body.x, body.y)
    return {"queued": True, "taskId": async_result.id, "queue": QUEUE_NAME}


@app.post("/enqueue/multiply")
def enqueue_multiply(body: EnqueueRequest):
    async_result = multiply.delay(body.x, body.y)
    return {"queued": True, "taskId": async_result.id, "queue": QUEUE_NAME}
