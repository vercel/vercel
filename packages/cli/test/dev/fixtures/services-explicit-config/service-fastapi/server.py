import os
from fastapi import FastAPI

app = FastAPI(root_path=os.getenv("VERCEL_SERVICE_ROUTE_PREFIX"))


@app.get('/')
def root():
    return {
        "framework": "fastapi",
        "service": "service-fastapi",
    }
