from fastapi import FastAPI
from fastapi.responses import PlainTextResponse

app = FastAPI()


@app.get("/api/collision.txt", response_class=PlainTextResponse)
def api_collision() -> str:
    return "API_ROUTE_WON"


@app.post("/method-collision.txt", response_class=PlainTextResponse)
def method_collision() -> str:
    return "POST_ROUTE_WON"


app.frontend("/", directory="frontend", fallback="index.html")
