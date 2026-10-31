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


# The top-level rewrite routes "/api/:path*" to this service without stripping
# the prefix, so every route carries it.
@app.get("/api")
def root():
    return {"message": "celery services example", "queue": QUEUE_NAME}


@app.post("/api/enqueue")
def enqueue(body: EnqueueRequest):
    result = process_job.delay(body.request_id, body.x, body.y)
    return {"ok": True, "requestId": body.request_id, "taskId": result.id}


@app.get("/api/status/{request_id}")
def status(request_id: str):
    result = get_cache(namespace=CACHE_NAMESPACE).get(request_id)
    return {"processed": result is not None, "result": result}
