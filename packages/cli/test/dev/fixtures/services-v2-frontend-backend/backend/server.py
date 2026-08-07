from fastapi import FastAPI, Request, Response

app = FastAPI()


@app.get("/{full_path:path}")
def echo(full_path: str, request: Request, response: Response):
    response.headers["x-overridden"] = "origin"
    return {
        "service": "backend",
        "received_path": request.url.path,
        "received_query": request.url.query,
        "received_x_injected": request.headers.get("x-injected"),
    }
