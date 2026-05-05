from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI()


@app.get("/api/parent/child")
def child_root():
    return {"message": "Hello from Child FastAPI"}


@app.get("/api/parent/child/health")
def child_health():
    return {"status": "child-ok"}


@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(status_code=404, content={"detail": "404 from Child FastAPI"})
