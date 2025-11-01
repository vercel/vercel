from contextlib import asynccontextmanager
from fastapi import FastAPI

MODELS = ["a", "b", "c"]

@asynccontextmanager
async def lifespan(app: FastAPI):
    MODELS.append("d")
    yield

app = FastAPI(lifespan=lifespan)

@app.get("/")
async def root(token: str):
    return f"ok:{token}:{''.join(MODELS)}"
