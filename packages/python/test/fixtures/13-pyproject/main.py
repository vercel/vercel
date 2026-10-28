from fastapi import FastAPI, HTTPException
import fastapi

app = FastAPI()

@app.get("/api/version")
def version():
    return {"fastapi_version": fastapi.__version__}

@app.get("/api/dev-dependencies")
def dev_dependencies():
    try:
        import ruff
        raise HTTPException(status_code=500, detail="Dev dependencies should not be installed")
    except ImportError:
        return {"ok": True}

@app.get("/api/optional-dependencies")
def optional_dependencies():
    try:
        import mypy
        raise HTTPException(status_code=500, detail="Optional dependencies should not be installed")
    except ImportError:
        return {"ok": True}
