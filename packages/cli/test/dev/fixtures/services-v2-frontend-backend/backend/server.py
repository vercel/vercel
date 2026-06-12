from fastapi import FastAPI, Request

app = FastAPI()


@app.get("/{full_path:path}")
def echo(full_path: str, request: Request):
    return {
        "service": "backend",
        "received_path": request.url.path,
        "received_query": request.url.query,
    }
