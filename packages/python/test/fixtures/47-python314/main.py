from fastapi import FastAPI
import sys

app = FastAPI()


@app.get("/api/version")
def version():
    return {
        "major": sys.version_info.major,
        "minor": sys.version_info.minor,
        "micro": sys.version_info.micro,
    }
