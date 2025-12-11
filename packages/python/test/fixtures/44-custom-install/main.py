from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    # Check that flask is NOT installed
    try:
        import flask
        return {"error": "flask should not be installed"}
    except ImportError:
        pass

    # Check that fastapi version is 0.123.9
    import fastapi
    if fastapi.__version__ != "0.123.9":
        return {"error": f"fastapi version should be 0.123.9, got {fastapi.__version__}"}

    return {"status": "ok", "fastapi_version": fastapi.__version__}
