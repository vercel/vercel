from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def root():
    return {
        "message": "Hello from auto-detected backend!",
        "service": "backend",
    }
