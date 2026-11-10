from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel
from vercel.cache import get_cache
from vercel.workflow import start

from flows import CACHE_NAMESPACE, process_job as process_addition
from multiplication_flows import (
    MULTIPLICATION_CACHE_NAMESPACE,
    process_job as process_multiplication,
)

app = FastAPI()


class StartRequest(BaseModel):
    request_id: str
    x: int = 2
    y: int = 3


@app.get("/")
def root():
    return {"message": "namespaced workflow example"}


@app.post("/start")
async def start_workflow(body: StartRequest):
    run = await start(process_addition, body.request_id, body.x, body.y)
    return {"ok": True, "requestId": body.request_id, "runId": run.run_id}


@app.get("/status/{request_id}")
def status(request_id: str):
    result = get_cache(namespace=CACHE_NAMESPACE).get(request_id)
    return {"processed": result is not None, "result": result}


@app.post("/start-multiplication")
async def start_multiplication_workflow(body: StartRequest):
    run = await start(process_multiplication, body.request_id, body.x, body.y)
    return {"ok": True, "requestId": body.request_id, "runId": run.run_id}


@app.get("/status-multiplication/{request_id}")
def multiplication_status(request_id: str):
    result = get_cache(namespace=MULTIPLICATION_CACHE_NAMESPACE).get(
        f"multiplication:{request_id}"
    )
    return {"processed": result is not None, "result": result}
