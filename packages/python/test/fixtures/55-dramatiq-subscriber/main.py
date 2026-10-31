from __future__ import annotations

import dramatiq
from dramatiq.results import ResultMissing
from fastapi import FastAPI
from pydantic import BaseModel
from vercel.cache import get_cache

from tasks import MESSAGE_CACHE_NAMESPACE, QUEUE_NAME, process_job

app = FastAPI()


class EnqueueRequest(BaseModel):
    request_id: str
    x: int = 2
    y: int = 3


@app.get("/")
def root():
    return {"message": "dramatiq subscriber example", "queue": QUEUE_NAME}


@app.post("/enqueue")
def enqueue(body: EnqueueRequest):
    message = process_job.send(body.request_id, body.x, body.y)
    get_cache(namespace=MESSAGE_CACHE_NAMESPACE).set(
        body.request_id,
        {"message": message.encode().decode("utf-8")},
        options={"ttl": 300},
    )
    return {"ok": True, "requestId": body.request_id, "messageId": message.message_id}


@app.get("/status/{request_id}")
def status(request_id: str):
    stored = get_cache(namespace=MESSAGE_CACHE_NAMESPACE).get(request_id)
    if stored is None:
        return {"processed": False, "result": None}
    message = dramatiq.Message.decode(stored["message"].encode("utf-8"))
    try:
        result = message.get_result()
    except ResultMissing:
        return {"processed": False, "result": None}
    return {"processed": True, "result": result}
