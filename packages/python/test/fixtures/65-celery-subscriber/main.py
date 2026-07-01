from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel
from vercel.cache import get_cache

from tasks import CACHE_NAMESPACE, QUEUE_NAME, process_job

app = FastAPI()


class EnqueueRequest(BaseModel):
    request_id: str
    x: int = 2
    y: int = 3


@app.get("/")
def root():
    return {"message": "celery subscriber example", "queue": QUEUE_NAME}


@app.post("/enqueue")
def enqueue(body: EnqueueRequest):
    result = process_job.delay(body.request_id, body.x, body.y)
    return {"ok": True, "requestId": body.request_id, "taskId": result.id}


@app.get("/status/{request_id}")
def status(request_id: str):
    result = get_cache(namespace=CACHE_NAMESPACE).get(request_id)
    return {"processed": result is not None, "result": result}
