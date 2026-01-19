import sys
from fastapi import FastAPI

app = FastAPI()


@app.get("/api/version")
def version():
    """Returns the Python version being used at runtime."""
    return {
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}",
        "python_full_version": sys.version,
    }


@app.get("/api/health")
def health():
    """Simple health check endpoint."""
    return {"ok": True}
