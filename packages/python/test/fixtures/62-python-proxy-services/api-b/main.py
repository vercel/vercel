from fastapi import FastAPI, Request

app = FastAPI()


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def catch_all(request: Request, path: str = ""):
    return {
        "service": "api-b",
        "path": request.url.path,
        "headers": {k: v for k, v in request.headers.items() if k.startswith("x-proxy-")},
    }
