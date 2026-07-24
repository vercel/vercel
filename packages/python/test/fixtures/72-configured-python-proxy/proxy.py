from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

proxy = FastAPI()


@proxy.middleware("http")
async def routing_middleware(request: Request, call_next):
    if request.url.path == "/protected/intercept":
        return JSONResponse(
            {
                "source": "python-proxy",
                "request_header": request.headers.get("x-proxy-test"),
            },
            headers={"x-python-proxy": "intercepted"},
        )

    response = await call_next(request)
    response.headers["x-python-proxy"] = "continued"
    return response
