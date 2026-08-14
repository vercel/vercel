from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def root():
    return {
        "message": "Hello from backend service!",
        "service": "backend",
    }


@app.get("/data")
def data():
    return {"items": ["a", "b", "c"]}
