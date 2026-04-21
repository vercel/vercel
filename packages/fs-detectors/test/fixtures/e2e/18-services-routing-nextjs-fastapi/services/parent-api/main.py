from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI()


@app.get("/api/parent")
def parent_root():
    return {"message": "Hello from Parent FastAPI"}


@app.get("/api/parent/health")
def parent_health():
    return {"status": "parent-ok"}


@app.get("/api/parent/child/legacy")
def parent_legacy_root():
    return {"message": "Hello from Parent FastAPI"}


@app.get("/api/parent/child/legacy/health")
def parent_legacy_health():
    return {"status": "legacy-ok"}


@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        status_code=404, content={"detail": "404 from Parent FastAPI"}
    )
