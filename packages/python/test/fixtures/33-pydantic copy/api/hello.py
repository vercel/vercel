from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.responses import StreamingResponse


app = FastAPI()

@app.get("/api/hello")
async def stream():
    return {"message": "Hello, World!"}
