from starlette.responses import JSONResponse


async def proxy(request):
    if request.url.path == "/protected/intercept":
        return JSONResponse(
            {
                "source": "python-proxy",
                "request_header": request.headers.get("x-proxy-test"),
            }
        )

    return None
