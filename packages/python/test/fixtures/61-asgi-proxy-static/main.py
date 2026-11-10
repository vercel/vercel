from fastapi import FastAPI, Request

app = FastAPI()


@app.api_route("/{path:path}", methods=["GET", "POST"])
async def echo(request: Request) -> dict[str, object]:
    # Only x-test-* headers are echoed so probes can match the whole body.
    headers = {
        name: value for name, value in sorted(request.headers.items()) if name.startswith("x-test-")
    }
    return {
        "method": request.method,
        "path": request.url.path,
        "query": request.url.query,
        "headers": headers,
        "body": (await request.body()).decode(),
    }
