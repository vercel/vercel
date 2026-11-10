from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse

app = FastAPI()


@app.middleware("http")
async def tag(request: Request, call_next):
    response = await call_next(request)
    response.headers["x-fastapi-middleware"] = "ran"
    return response


@app.get("/api/collision.txt", response_class=PlainTextResponse)
def api_collision() -> str:
    return "API_ROUTE_WON"


app.frontend("/", directory="frontend")
