from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

import examples.basic.worker  # noqa: F401  # Import so @subscribe handlers are registered
from vercel.workers import send

# This queue name should match the `topic` configured for the worker
# in examples/basic/pyproject.toml.
QUEUE_NAME = "default"

app = FastAPI(
    title="Vercel Workers + FastAPI (basic example)",
    description="Simple web app that enqueues jobs for a Vercel Worker.",
    version="0.1.0",
)


class EnqueueRequest(BaseModel):
    message: str


@app.post("/enqueue")
def enqueue_job(body: EnqueueRequest):
    """
    Enqueue a job onto the default queue.

    The Vercel runtime (with OIDC enabled) will provide authentication
    so that send() can talk to the Queue Service.
    """
    result = send(QUEUE_NAME, {"message": body.message})
    return {
        "queued": True,
        "messageId": result["messageId"],
        "queue": QUEUE_NAME,
    }


@app.get("/")
def read_root():
    return {
        "message": "POST a JSON body like {'message': 'hello'} to /enqueue to send a job.",
        "queue": QUEUE_NAME,
    }
