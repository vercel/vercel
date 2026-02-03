import os
from fastapi import FastAPI

root_path = os.environ.get("VERCEL_SERVICE_BASE_PATH", "")
app = FastAPI(root_path=root_path)

@app.get("/")
def root():
    return {
        "framework": "fastapi",
        "service": "service-fastapi",
    }
