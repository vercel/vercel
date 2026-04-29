import os

import httpx
from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def root():
    return {"service": "service-a"}


@app.get("/call-service-b")
async def call_service_b():
    service_b_url = os.environ.get("SERVICE_B_URL", "")
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{service_b_url}/")
        resp.raise_for_status()
        return {"service": "service-a", "from_service_b": resp.json()}
