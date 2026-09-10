from fastapi import FastAPI, Request

app = FastAPI()


@app.get("/new")
def rewritten_route(request: Request):
    return {"route": "new", "path": request.url.path}
