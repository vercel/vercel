from fastapi import FastAPI
import fastapi

app = FastAPI()

@app.get("/api/version")
def version():
    return {"fastapi_version": fastapi.__version__}
