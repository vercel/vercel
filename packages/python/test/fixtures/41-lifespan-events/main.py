from contextlib import asynccontextmanager
from fastapi import FastAPI
import logging

MODELS = ["a", "b", "c"]

@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.info("starting up...")
    MODELS.append("d")
    yield

app = FastAPI(lifespan=lifespan)

@app.get("/")
async def root(token: str):
    return f"ok:{token}:{''.join(MODELS)}"
