from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel
from tasks import QUEUE_NAME, add, greet, multiply

app = FastAPI(
    title="Dramatiq on Vercel Queues (example)",
    description="Enqueue Dramatiq tasks that are published to Vercel Queues via vercel-workers.",
    version="0.1.0",
)


class EnqueueRequest(BaseModel):
    x: int
    y: int


class GreetRequest(BaseModel):
    name: str


@app.get("/")
def root():
    return {
        "message": "POST to /enqueue/add or /enqueue/multiply with {x, y}, or /enqueue/greet with {name}",
        "queue": QUEUE_NAME,
    }


@app.post("/enqueue/add")
def enqueue_add(body: EnqueueRequest):
    # This publishes a task message to Vercel Queues via the VercelQueuesBroker.
    # Note: vercel-workers does not auto "fake" the queue locally. Configure
    # VERCEL_QUEUE_TOKEN (and optionally VERCEL_QUEUE_BASE_URL) to target a real
    # queue service when running outside Vercel.
    result = add.send(body.x, body.y)
    return {"queued": True, "messageId": result.message_id, "queue": QUEUE_NAME}


@app.post("/enqueue/multiply")
def enqueue_multiply(body: EnqueueRequest):
    result = multiply.send(body.x, body.y)
    return {"queued": True, "messageId": result.message_id, "queue": QUEUE_NAME}


@app.post("/enqueue/greet")
def enqueue_greet(body: GreetRequest):
    result = greet.send(body.name)
    return {"queued": True, "messageId": result.message_id, "queue": QUEUE_NAME}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
