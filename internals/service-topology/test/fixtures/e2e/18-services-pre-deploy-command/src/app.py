from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from src.version import VERSION

app = FastAPI()


@app.get("/")
def root():
    return PlainTextResponse(f"version:{VERSION}")
