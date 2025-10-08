from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
import asyncio

class RequestData(BaseModel):
    name: str


app = FastAPI()


@app.post("/api/hello")
async def xinchao(data: RequestData):
    return {'name': data.name}

async def fake_stream():
    yield b"Hello, "
    await asyncio.sleep(1)
    yield b"World!"

@app.get("/api/hello")
async def stream():
    return StreamingResponse(fake_stream())
