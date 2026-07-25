from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()


@app.get("/static/api-first.txt", response_class=PlainTextResponse)
def api_first() -> str:
    return "API_ROUTE_WON"


app.mount("/static", StaticFiles(directory="my_files"), name="static")


@app.get("/static/mount-first.txt", response_class=PlainTextResponse)
def mount_first() -> str:
    return "API_ROUTE_LOST"
