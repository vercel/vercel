import shutil
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from prisma import Prisma

prisma = Prisma()

# Lambda /var/task is read-only; sqlite needs a writable location.
_SRC_DB = "/var/task/dev.db"
_TMP_DB = "/tmp/dev.db"


@asynccontextmanager
async def lifespan(app):
    if os.path.exists(_SRC_DB) and not os.path.exists(_TMP_DB):
        shutil.copy2(_SRC_DB, _TMP_DB)
    await prisma.connect()
    try:
        yield
    finally:
        await prisma.disconnect()


app = FastAPI(lifespan=lifespan)


@app.get("/")
async def root():
    items = await prisma.item.find_many(take=1)
    return {"prisma": "ok", "items": len(items)}
