from fastapi import FastAPI
from fastapi.responses import PlainTextResponse

app = FastAPI()


# `app.frontend()` registers the build as *low-priority* routes checked only
# after every normal route, so this route wins for `/collision.txt` even though
# `frontend/collision.txt` exists in the build.
@app.get("/collision.txt", response_class=PlainTextResponse)
def frontend_collision() -> str:
    return "API_ROUTE_WON"


app.frontend("/", directory="frontend")
