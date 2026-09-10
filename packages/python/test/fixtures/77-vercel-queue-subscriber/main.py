from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel
from vercel.cache import get_cache
from vercel.queue import send

from tasks import RESULT_CACHE_NAMESPACE, TOPIC

app = FastAPI()


class EnqueueRequest(BaseModel):
    request_id: str
    x: int = 2
    y: int = 3


@app.get("/")
def root():
    return {"message": "vercel-queue subscriber example", "topic": TOPIC}


@app.post("/enqueue")
async def enqueue(body: EnqueueRequest):
    message_id = await send(TOPIC, body.model_dump())
    return {"ok": True, "requestId": body.request_id, "messageId": message_id}


@app.get("/status/{request_id}")
def status(request_id: str):
    stored = get_cache(namespace=RESULT_CACHE_NAMESPACE).get(request_id)
    if stored is None:
        return {"processed": False, "result": None}
    return {"processed": True, "result": stored}
